// apps/worker/test/support/mail-sync-contract.ts
//
// Sync scenarios every mail vendor must pass, run through the sync processor against the
// real adapter and the vendor HTTP fake. Each vendor's contract test file calls
// runMailSyncContract once.
import type { EmailIntegrationId } from '@repo/database';
import {
  getEmailAccountById,
  getEmailThreadByProviderThreadId,
  listEmailMessagesByThreadId,
} from '@repo/database';
import { EMAIL_SYNC_JOB } from '@repo/queue';
import {
  MAILBOX_FIRST_MESSAGE,
  MAILBOX_NEW_MESSAGE,
  resetProviderMocks,
  truncateAllTables,
  useRealMailProviders,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processEmailSyncJob } from '../../src/processors/email-sync.processor';
import { seedMailUser } from './email-fixtures';
import { buildJob } from './job';

export interface MailSyncContractVendor {
  name: string;
  integrationId: EmailIntegrationId;
  threadId: string;
  newMessageId: string;
  /** The cursor the vendor hands out on a fresh sync. */
  initialCursor: string;
  isInitialCursor: (cursor: string | null) => boolean;
  isAdvancedCursor: (cursor: string | null) => boolean;
  /** Makes the vendor reject the next incremental sync as an expired cursor. */
  expireCursor: () => void;
  /** Makes the vendor reject the token on the first call of an incremental sync. */
  rejectToken: () => void;
}

function syncJob(accountId: string) {
  return buildJob({ name: EMAIL_SYNC_JOB, data: { accountId } });
}

export function runMailSyncContract(vendor: MailSyncContractVendor): void {
  describe(`mail sync contract: ${vendor.name}`, () => {
    beforeEach(async () => {
      await truncateAllTables();
      resetProviderMocks();
      useRealMailProviders();
    });

    async function loadThreadMessages(accountId: string) {
      const thread = await getEmailThreadByProviderThreadId({
        accountId,
        providerThreadId: vendor.threadId,
      });
      return listEmailMessagesByThreadId({ threadId: thread?.id ?? '' });
    }

    test('the first sync imports the recent thread and stores the vendor cursor', async () => {
      const { account } = await seedMailUser({ integrationId: vendor.integrationId });

      await processEmailSyncJob(syncJob(account.id));

      const messages = await loadThreadMessages(account.id);
      expect(messages.map((message) => message.subject)).toContain(MAILBOX_FIRST_MESSAGE.subject);
      const stored = await getEmailAccountById({ id: account.id });
      expect(stored?.syncState).toBe('idle');
      expect(vendor.isInitialCursor(stored?.syncCursor ?? null)).toBe(true);
    });

    test('an incremental sync imports the new message and advances the cursor', async () => {
      const { account } = await seedMailUser({
        integrationId: vendor.integrationId,
        syncCursor: vendor.initialCursor,
      });

      await processEmailSyncJob(syncJob(account.id));

      const messages = await loadThreadMessages(account.id);
      const imported = messages.find(
        (message) => message.providerMessageId === vendor.newMessageId,
      );
      expect(imported?.subject).toBe(MAILBOX_NEW_MESSAGE.subject);
      expect(imported?.isUnread).toBe(true);
      const stored = await getEmailAccountById({ id: account.id });
      expect(vendor.isAdvancedCursor(stored?.syncCursor ?? null)).toBe(true);
    });

    test('an expired cursor falls back to a full resync with a fresh cursor', async () => {
      const { account } = await seedMailUser({
        integrationId: vendor.integrationId,
        syncCursor: vendor.initialCursor,
      });
      vendor.expireCursor();

      await processEmailSyncJob(syncJob(account.id));

      const messages = await loadThreadMessages(account.id);
      expect(messages.map((message) => message.subject)).toContain(MAILBOX_FIRST_MESSAGE.subject);
      const stored = await getEmailAccountById({ id: account.id });
      expect(stored?.syncState).toBe('idle');
      expect(vendor.isInitialCursor(stored?.syncCursor ?? null)).toBe(true);
    });

    test('a token the vendor rejects marks the mailbox for reconnect', async () => {
      const { account } = await seedMailUser({
        integrationId: vendor.integrationId,
        syncCursor: vendor.initialCursor,
      });
      vendor.rejectToken();

      await expect(processEmailSyncJob(syncJob(account.id))).rejects.toThrow('API error 401');

      const stored = await getEmailAccountById({ id: account.id });
      expect(stored?.syncState).toBe('reauth_required');
      expect(stored?.syncCursor).toBe(vendor.initialCursor);
    });
  });
}
