import { db } from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { staleRunsProcessor } from '../../src/crons/stale-runs.cron';
import { hoursAgo, seedWorkflowRun } from '../support/crons-fixtures';

async function runStatus(runId: string): Promise<string | undefined> {
  const run = await db.query.workflowRun.findFirst({ where: { id: runId } });
  return run?.status;
}

describe('stale runs cron', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('fails pending runs older than 1 hour and running runs older than 2 hours', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const stalePendingId = await seedWorkflowRun({
      userId,
      workspaceId,
      status: 'pending',
      createdAt: hoursAgo(1.5),
    });
    const staleRunningId = await seedWorkflowRun({
      userId,
      workspaceId,
      status: 'running',
      createdAt: hoursAgo(3),
      startedAt: hoursAgo(2.5),
    });

    await staleRunsProcessor();

    expect(await runStatus(stalePendingId)).toBe('failed');
    expect(await runStatus(staleRunningId)).toBe('failed');
  });

  test('marks stale runs with a timeout error and a finish time', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const runId = await seedWorkflowRun({
      userId,
      workspaceId,
      status: 'pending',
      createdAt: hoursAgo(2),
    });

    await staleRunsProcessor();

    const run = await db.query.workflowRun.findFirst({ where: { id: runId } });
    expect(run?.error).toBe('timed out');
    expect(run?.finishedAt).toBeInstanceOf(Date);
  });

  test('leaves fresh runs untouched', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const freshPendingId = await seedWorkflowRun({
      userId,
      workspaceId,
      status: 'pending',
      createdAt: hoursAgo(0.5),
    });
    const freshRunningId = await seedWorkflowRun({
      userId,
      workspaceId,
      status: 'running',
      createdAt: hoursAgo(1.5),
      startedAt: hoursAgo(1.5),
    });

    await staleRunsProcessor();

    expect(await runStatus(freshPendingId)).toBe('pending');
    expect(await runStatus(freshRunningId)).toBe('running');
  });

  test('leaves terminal runs untouched', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const succeededId = await seedWorkflowRun({
      userId,
      workspaceId,
      status: 'completed',
      createdAt: hoursAgo(10),
      startedAt: hoursAgo(10),
    });

    await staleRunsProcessor();

    expect(await runStatus(succeededId)).toBe('completed');
  });
});
