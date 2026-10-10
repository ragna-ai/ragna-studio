import { EMAIL_SYNC_JOB } from '@repo/queue';
import {
  enqueuedJobs,
  queueAddMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { emailSyncCronProcessor } from '../../src/crons/email-sync.cron';
import { seedEmailAccount } from '../support/crons-fixtures';

describe('email sync cron', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('enqueues one sync job per due account with the account id as job id', async () => {
    const firstUser = await seedAuthenticatedUser();
    const secondUser = await seedAuthenticatedUser();
    const firstAccount = await seedEmailAccount({ userId: firstUser.userId });
    const secondAccount = await seedEmailAccount({ userId: secondUser.userId, syncState: 'error' });

    await emailSyncCronProcessor();

    expect(enqueuedJobs(EMAIL_SYNC_JOB)).toHaveLength(2);
    expect(queueAddMock).toHaveBeenCalledWith(
      EMAIL_SYNC_JOB,
      { accountId: firstAccount.id },
      { jobId: firstAccount.id },
    );
    expect(queueAddMock).toHaveBeenCalledWith(
      EMAIL_SYNC_JOB,
      { accountId: secondAccount.id },
      { jobId: secondAccount.id },
    );
  });

  test('skips accounts that need reauthentication', async () => {
    const { userId } = await seedAuthenticatedUser();
    await seedEmailAccount({ userId, syncState: 'reauth_required' });

    await emailSyncCronProcessor();

    expect(enqueuedJobs(EMAIL_SYNC_JOB)).toHaveLength(0);
  });

  test('enqueues nothing when no account is connected', async () => {
    await emailSyncCronProcessor();

    expect(enqueuedJobs(EMAIL_SYNC_JOB)).toHaveLength(0);
  });
});
