import { getEmailAccountById } from '@repo/database';
import { EMAIL_SYNC_JOB, NOTIFY_USER_JOB } from '@repo/queue';
import {
  createMailProviderMock,
  enqueuedJobs,
  expireConnectionAccessToken,
  providerHttp,
  rejectProviderRefresh,
  resetProviderMocks,
  syncFromCursorMock,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processEmailSyncJob } from '../../src/processors/email-sync.processor';
import { seedMailUser } from '../support/email-fixtures';
import { buildJob } from '../support/job';

function syncJob(accountId: string) {
  return buildJob({ name: EMAIL_SYNC_JOB, data: { accountId } });
}

describe('email sync with a connection', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('reads the mailbox with the token of its own connection', async () => {
    const { account } = await seedMailUser({ syncCursor: 'cursor-1', accessToken: 'token-a' });
    await seedMailUser({ syncCursor: 'cursor-2', accessToken: 'token-b' });

    await processEmailSyncJob(syncJob(account.id));

    const options = createMailProviderMock.mock.calls.at(-1)?.[0];
    expect(await options?.getAccessToken()).toBe('token-a');
    expect(syncFromCursorMock).toHaveBeenCalledTimes(1);
  });

  test('refreshes an expired token for the mailbox before reading it', async () => {
    const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
    await expireConnectionAccessToken({ connectionId: account.connectionId });

    await processEmailSyncJob(syncJob(account.id));

    const options = createMailProviderMock.mock.calls.at(-1)?.[0];
    expect(await options?.getAccessToken()).toBe('refreshed-access-token');
    expect(providerHttp.tokenRequests).toHaveLength(1);
  });

  test('stops syncing a mailbox whose connection the provider rejects', async () => {
    const { userId, account } = await seedMailUser({ syncCursor: 'cursor-1' });
    await expireConnectionAccessToken({ connectionId: account.connectionId });
    rejectProviderRefresh('google');

    const result = await processEmailSyncJob(syncJob(account.id));

    expect(result).toEqual({ success: true });
    expect(syncFromCursorMock).not.toHaveBeenCalled();
    const synced = await getEmailAccountById({ id: account.id });
    expect(synced?.syncState).toBe('reauth_required');
    const notifications = enqueuedJobs(NOTIFY_USER_JOB);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.[1]).toMatchObject({ userId, type: 'integration_needs_reauth' });
  });

  test('does not ask the provider or notify again on the next sync', async () => {
    const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
    await expireConnectionAccessToken({ connectionId: account.connectionId });
    rejectProviderRefresh('google');

    await processEmailSyncJob(syncJob(account.id));
    await processEmailSyncJob(syncJob(account.id));

    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(1);
    expect(providerHttp.tokenRequests).toHaveLength(1);
  });
});
