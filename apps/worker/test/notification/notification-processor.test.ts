import { listNotifications } from '@repo/database';
import { NOTIFY_USER_JOB } from '@repo/queue';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processNotificationJob } from '../../src/processors/notification.processor';
import { buildJob } from '../support/job';

describe('processNotificationJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('NOTIFY_USER_JOB creates the notification row', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const data = {
      workflowId: Bun.randomUUIDv7(),
      runId: Bun.randomUUIDv7(),
      workflowName: 'Nightly report',
      workspaceId,
    };

    const result = await processNotificationJob(
      buildJob({
        name: NOTIFY_USER_JOB,
        data: { userId, type: 'workflow_run_succeeded', data },
      }),
    );

    const notifications = await listNotifications({ userId });
    expect(result).toEqual({ success: true });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.type).toBe('workflow_run_succeeded');
    expect(notifications[0]?.data).toEqual(data);
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    expect(processNotificationJob(job)).rejects.toThrow('Unknown notification job: not-a-real-job');
  });
});
