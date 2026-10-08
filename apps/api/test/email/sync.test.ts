import { EMAIL_SYNC_QUEUE } from '@repo/queue';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedConnectedGmailAccount } from './support/email-fixtures';
import {
  completeEmailQueueJob,
  emailSyncAddMock,
  getPendingEmailJobCount,
  resetEmailQueueMock,
} from './support/email-queue.mock';
import { resetMailProviderMock } from './support/mail-provider.mock';

// Manual "Sync now" (specs/email/prd.md, "API": "enqueues the same email-sync
// job the cron fans out, deduped per account via the BullMQ jobId").
// email.service.ts's syncEmailAccountNowForUser always calls
// `queue.emailSync().add(..., { jobId: account.id })`; the fake queue
// (test/email/support/email-queue.mock.ts) tracks distinct pending jobIds
// per queue so a test can assert "still one job" the way BullMQ's own
// jobId dedupe would in production, not just "add() was called".

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

async function triggerSync(cookieHeader: string) {
  return app.request('/email/account/sync', { method: 'POST', headers: { cookie: cookieHeader } });
}

describe('POST /email/account/sync', () => {
  test('404s when Gmail is not connected', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await triggerSync(cookieHeader);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('enqueues the sync job with jobId = accountId and returns 202', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
    emailSyncAddMock.mockClear(); // connect itself also enqueues once

    const response = await triggerSync(cookieHeader);

    expect(response.status).toBe(StatusCodes.ACCEPTED);
    const body = z.object({ account: z.object({ id: z.string(), syncState: z.string() }) }).parse(
      await response.json(),
    );
    expect(body.account.id).toBe(accountId);
    expect(emailSyncAddMock).toHaveBeenCalledTimes(1);
    expect(emailSyncAddMock.mock.calls[0]?.[2]).toMatchObject({ jobId: accountId });
    expect(getPendingEmailJobCount(EMAIL_SYNC_QUEUE)).toBe(1);
  });

  test('a second trigger while one is still queued does not double-add', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
    emailSyncAddMock.mockClear();

    const first = await triggerSync(cookieHeader);
    const second = await triggerSync(cookieHeader);

    expect(first.status).toBe(StatusCodes.ACCEPTED);
    expect(second.status).toBe(StatusCodes.ACCEPTED);
    // The controller always calls add(); BullMQ's own jobId dedupe is what
    // stops a second job from actually being created, not the controller.
    expect(emailSyncAddMock).toHaveBeenCalledTimes(2);
    expect(emailSyncAddMock.mock.calls[0]?.[2]).toMatchObject({ jobId: accountId });
    expect(emailSyncAddMock.mock.calls[1]?.[2]).toMatchObject({ jobId: accountId });
    expect(getPendingEmailJobCount(EMAIL_SYNC_QUEUE)).toBe(1);
  });

  test('a trigger after the queued job completes enqueues a fresh one', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
    emailSyncAddMock.mockClear();

    await triggerSync(cookieHeader);
    expect(getPendingEmailJobCount(EMAIL_SYNC_QUEUE)).toBe(1);

    completeEmailQueueJob(EMAIL_SYNC_QUEUE, accountId);
    expect(getPendingEmailJobCount(EMAIL_SYNC_QUEUE)).toBe(0);

    await triggerSync(cookieHeader);
    expect(getPendingEmailJobCount(EMAIL_SYNC_QUEUE)).toBe(1);
    expect(emailSyncAddMock).toHaveBeenCalledTimes(2);
  });
});
