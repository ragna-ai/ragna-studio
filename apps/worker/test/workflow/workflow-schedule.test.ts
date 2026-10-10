import { db, sql } from '@repo/database';
import { organization, user as userTable } from '@repo/database/schema';
import {
  WORKFLOW_RUN_JOB,
  WORKFLOW_SCHEDULE_TICK_JOB,
  WORKFLOW_SCHEDULES_QUEUE,
} from '@repo/queue';
import {
  deleteSeededUser,
  getQueueJobSchedulersMock,
  queueAddMock,
  removeQueueJobSchedulerMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedOrganizationMember,
  truncateAllTables,
  upsertQueueJobSchedulerMock,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processWorkflowScheduleJob } from '../../src/processors/workflow-schedule.processor';
import { reconcileSchedules } from '../../src/workflow/reconcile-schedules';
import { buildJob } from '../support/job';
import { seedWorkflow } from '../support/workflow-fixtures';

const CRON = '0 9 * * *';

function tick(workflowId: string) {
  return processWorkflowScheduleJob(
    buildJob({ name: WORKFLOW_SCHEDULE_TICK_JOB, data: { workflowId } }),
  );
}

async function seedScheduledWorkflow(author: SeededAuthenticatedUser): Promise<string> {
  return seedWorkflow({
    userId: author.userId,
    workspaceId: author.workspaceId,
    scheduleCron: CRON,
  });
}

async function listRuns(workflowId: string) {
  return db.query.workflowRun.findMany({ where: { workflowId } });
}

describe('processWorkflowScheduleJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('a deleted workflow removes its scheduler', async () => {
    const workflowId = Bun.randomUUIDv7();

    await tick(workflowId);

    expect(removeQueueJobSchedulerMock).toHaveBeenCalledWith({
      queueName: WORKFLOW_SCHEDULES_QUEUE,
      schedulerId: workflowId,
    });
  });

  test('a workflow without a cron removes its scheduler', async () => {
    const author = await seedAuthenticatedUser();
    const workflowId = await seedWorkflow({
      userId: author.userId,
      workspaceId: author.workspaceId,
    });

    await tick(workflowId);

    expect(removeQueueJobSchedulerMock).toHaveBeenCalledTimes(1);
    expect(await listRuns(workflowId)).toHaveLength(0);
  });

  test('an unpublished workflow removes its scheduler', async () => {
    const author = await seedAuthenticatedUser();
    const workflowId = await seedWorkflow({
      userId: author.userId,
      workspaceId: author.workspaceId,
      scheduleCron: CRON,
      published: false,
    });

    await tick(workflowId);

    expect(removeQueueJobSchedulerMock).toHaveBeenCalledTimes(1);
    expect(await listRuns(workflowId)).toHaveLength(0);
  });

  test('a deleted organization skips the tick and keeps the scheduler', async () => {
    const author = await seedAuthenticatedUser();
    const workflowId = await seedScheduledWorkflow(author);
    await db.update(organization).set({ deletedAt: new Date() });

    await tick(workflowId);

    expect(removeQueueJobSchedulerMock).not.toHaveBeenCalled();
    expect(queueAddMock).not.toHaveBeenCalled();
    expect(await listRuns(workflowId)).toHaveLength(0);
  });

  test('an active run skips the tick', async () => {
    const author = await seedAuthenticatedUser();
    const workflowId = await seedScheduledWorkflow(author);
    await tick(workflowId);
    queueAddMock.mockClear();

    await tick(workflowId);

    expect(queueAddMock).not.toHaveBeenCalled();
    expect(await listRuns(workflowId)).toHaveLength(1);
  });

  test('a deleted author skips the tick without creating a run', async () => {
    const owner = await seedAuthenticatedUser();
    const membership = await db.query.organizationMember.findFirst({
      where: { userId: owner.userId },
    });
    const author = await seedOrganizationMember({
      organizationId: membership?.organizationId ?? '',
      role: 'member',
    });
    const workflowId = await seedScheduledWorkflow(author);
    await deleteSeededUser({ userId: author.userId });

    await tick(workflowId);

    expect(await listRuns(workflowId)).toHaveLength(0);
    expect(queueAddMock).not.toHaveBeenCalled();
    expect(removeQueueJobSchedulerMock).not.toHaveBeenCalled();
  });

  test('a soft-deleted author skips the tick without creating a run', async () => {
    const author = await seedAuthenticatedUser();
    const workflowId = await seedScheduledWorkflow(author);
    await db
      .update(userTable)
      .set({ deletedAt: new Date() })
      .where(sql`${userTable.id} = ${author.userId}`);

    await tick(workflowId);

    expect(await listRuns(workflowId)).toHaveLength(0);
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  test('the happy path creates a schedule run and enqueues it', async () => {
    const author = await seedAuthenticatedUser();
    const workflowId = await seedScheduledWorkflow(author);

    await tick(workflowId);

    const runs = await listRuns(workflowId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.triggeredBy).toBe('schedule');
    expect(runs[0]?.triggeredByUserId).toBe(author.userId);
    expect(runs[0]?.status).toBe('pending');
    expect(queueAddMock).toHaveBeenCalledWith(
      WORKFLOW_RUN_JOB,
      { runId: runs[0]?.id },
      { attempts: 3 },
    );
  });

  test('an enqueue failure marks the run failed and rethrows', async () => {
    const author = await seedAuthenticatedUser();
    const workflowId = await seedScheduledWorkflow(author);
    queueAddMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

    await expect(tick(workflowId)).rejects.toThrow('redis down');

    const runs = await listRuns(workflowId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error).toBe('Failed to enqueue workflow run');
  });

  test('unknown job name throws', async () => {
    await expect(processWorkflowScheduleJob(buildJob({ name: 'nope', data: {} }))).rejects.toThrow(
      'Unknown workflow schedule job: nope',
    );
  });
});

describe('reconcileSchedules', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('upserts every scheduled workflow and removes orphaned schedulers', async () => {
    const author = await seedAuthenticatedUser();
    const scheduledId = await seedScheduledWorkflow(author);
    await seedWorkflow({ userId: author.userId, workspaceId: author.workspaceId });
    getQueueJobSchedulersMock.mockImplementationOnce(() =>
      Promise.resolve([{ key: scheduledId }, { key: 'orphan-scheduler' }]),
    );

    await reconcileSchedules();

    expect(upsertQueueJobSchedulerMock).toHaveBeenCalledTimes(1);
    expect(upsertQueueJobSchedulerMock).toHaveBeenCalledWith({
      queueName: WORKFLOW_SCHEDULES_QUEUE,
      schedulerId: scheduledId,
      repeat: { pattern: CRON, tz: 'Europe/Berlin' },
      job: {
        name: WORKFLOW_SCHEDULE_TICK_JOB,
        data: { workflowId: scheduledId },
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { age: 24 * 3600 } },
      },
    });
    expect(removeQueueJobSchedulerMock).toHaveBeenCalledTimes(1);
    expect(removeQueueJobSchedulerMock).toHaveBeenCalledWith({
      queueName: WORKFLOW_SCHEDULES_QUEUE,
      schedulerId: 'orphan-scheduler',
    });
  });
});
