import { config } from '@repo/config';
import { db, saveTaskRunProgress, sql, startTaskRun } from '@repo/database';
import { taskRun } from '@repo/database/schema';
import { resetProviderMocks, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { staleTaskRunsProcessor } from '../../src/crons/stale-runs.cron';
import { hoursAgo } from '../support/crons-fixtures';
import {
  loadCommentsOfTask,
  loadRun,
  loadTask,
  seedQueuedTaskRun,
} from '../support/task-run-fixtures';

describe('stale task run sweeper', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('fails a run still queued after an hour, tells the user and restores the task', async () => {
    const seeded = await seedQueuedTaskRun();
    await db
      .update(taskRun)
      .set({ createdAt: hoursAgo(2) })
      .where(sql`${taskRun.id} = ${seeded.runId}`);

    await staleTaskRunsProcessor();

    expect((await loadRun(seeded)).status).toBe('failed');
    expect((await loadCommentsOfTask(seeded.taskId))[0]?.body).toContain('did not finish in time');
    expect((await loadTask(seeded.taskId))?.status).toBe('todo');
  });

  test('fails a run that has been running past its time limit plus the grace period', async () => {
    const seeded = await seedQueuedTaskRun();
    await startTaskRun({ workspaceId: seeded.workspaceId, taskRunId: seeded.runId, attempt: 1 });
    const pastLimitHours = (config.taskRunTimeLimitMinutes + 30) / 60;
    await db
      .update(taskRun)
      .set({ startedAt: hoursAgo(pastLimitHours) })
      .where(sql`${taskRun.id} = ${seeded.runId}`);

    await staleTaskRunsProcessor();

    expect((await loadRun(seeded)).status).toBe('failed');
  });

  test('lists the write actions a stale run took in its failure comment', async () => {
    const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
    await startTaskRun({ workspaceId: seeded.workspaceId, taskRunId: seeded.runId, attempt: 1 });
    await saveTaskRunProgress({
      workspaceId: seeded.workspaceId,
      taskRunId: seeded.runId,
      trace: [
        {
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          toolCalls: [
            { toolName: 'memory', input: { action: 'append', text: 'x' }, output: { ok: true } },
          ],
        },
      ],
    });
    await db
      .update(taskRun)
      .set({ startedAt: hoursAgo(5) })
      .where(sql`${taskRun.id} = ${seeded.runId}`);

    await staleTaskRunsProcessor();

    const comment = (await loadCommentsOfTask(seeded.taskId))[0]?.body ?? '';
    expect(comment).toContain('Actions already taken');
    expect(comment).toContain('- memory');
  });

  test('leaves a fresh run alone', async () => {
    const seeded = await seedQueuedTaskRun();
    await startTaskRun({ workspaceId: seeded.workspaceId, taskRunId: seeded.runId, attempt: 1 });

    await staleTaskRunsProcessor();

    expect((await loadRun(seeded)).status).toBe('running');
    expect(await loadCommentsOfTask(seeded.taskId)).toHaveLength(0);
  });
});
