import { config } from '@repo/config';
import {
  cancelTaskRunById,
  createTask,
  createTaskComment,
  db,
  failTaskRun,
  saveTaskRunProgress,
  startTaskRun,
} from '@repo/database';
import { RUN_TASK_JOB, UnrecoverableError } from '@repo/queue';
import {
  DRIVE_FOLDER,
  languageModelGenerateMock,
  queueAddMock,
  resetProviderMocks,
  scriptModelOutput,
  seedGoogleDriveConnection,
  truncateAllTables,
  GOOGLE_DRIVE_ENDPOINTS,
  vendorRequestsTo,
} from '@repo/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { processTaskRunJob } from '../../src/processors/task-run.processor';
import { buildJob } from '../support/job';
import {
  loadCommentsOfTask,
  loadRun,
  loadTask,
  seedFollowUpRun,
  seedQueuedTaskRun,
  type SeededTaskRun,
} from '../support/task-run-fixtures';

const FINAL_ATTEMPT = { attempts: 3, attemptsMade: 2 };
const FIRST_ATTEMPT = { attempts: 3, attemptsMade: 0 };

function runJob(taskRunId: string, attempt = FINAL_ATTEMPT) {
  return processTaskRunJob(buildJob({ name: RUN_TASK_JOB, data: { taskRunId }, ...attempt }));
}

function finishCall(outcome: 'completed' | 'needs_input', summary: string) {
  return { toolName: 'finishTaskRun', input: { outcome, summary } };
}

function rememberCall(text: string) {
  return { toolName: 'memory', input: { action: 'append', text } };
}

function promptSentToModel(): string {
  return JSON.stringify(languageModelGenerateMock.mock.calls);
}

function toolOutputs(trace: { toolCalls: { toolName: string; output?: unknown }[] }[]) {
  return trace.flatMap((step) => step.toolCalls.map((call) => [call.toolName, call.output]));
}

const restorers: (() => void)[] = [];
type OverridableConfigKey =
  | 'taskRunMaxSteps'
  | 'taskRunTimeLimitMinutes'
  | 'taskRunsEnabled'
  | 'taskRunMaxOvershootMicroCredits';

function overrideConfig<Key extends OverridableConfigKey>(key: Key, value: (typeof config)[Key]) {
  Object.defineProperty(config, key, { get: () => value, configurable: true });
  restorers.push(() => Reflect.deleteProperty(config, key));
}

describe('task run processor', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  afterEach(() => {
    for (const restore of restorers.splice(0)) restore();
  });

  describe('finishing', () => {
    test('posts the summary as the agent comment and moves the task to review', async () => {
      const seeded = await seedQueuedTaskRun();
      scriptModelOutput({ toolCalls: [finishCall('completed', 'All done.')] });

      await runJob(seeded.runId);

      const run = await loadRun(seeded);
      expect(run.status).toBe('succeeded');
      expect(run.outcome).toBe('completed');
      const comments = await loadCommentsOfTask(seeded.taskId);
      expect(comments).toHaveLength(1);
      expect(comments[0]).toMatchObject({
        body: 'All done.',
        authorKind: 'agent',
        authorAgentId: seeded.agentId,
        taskRunId: seeded.runId,
      });
      expect((await loadTask(seeded.taskId))?.status).toBe('in_review');
    });

    test('moves the task back to todo when the agent needs input', async () => {
      const seeded = await seedQueuedTaskRun();
      scriptModelOutput({ toolCalls: [finishCall('needs_input', 'Which quarter do you mean?')] });

      await runJob(seeded.runId);

      expect((await loadRun(seeded)).outcome).toBe('needs_input');
      expect((await loadTask(seeded.taskId))?.status).toBe('todo');
      const comments = await loadCommentsOfTask(seeded.taskId);
      expect(comments[0]?.body).toBe('Which quarter do you mean?');
    });

    test('uses the closing text as the summary when the agent never calls finish', async () => {
      const seeded = await seedQueuedTaskRun();
      scriptModelOutput({ text: 'Here is my result.' });

      await runJob(seeded.runId);

      const run = await loadRun(seeded);
      expect(run.status).toBe('succeeded');
      expect(run.outcome).toBe('completed');
      expect((await loadCommentsOfTask(seeded.taskId))[0]?.body).toBe('Here is my result.');
    });

    test('charges the run once under the task run key', async () => {
      const seeded = await seedQueuedTaskRun();
      scriptModelOutput({ toolCalls: [finishCall('completed', 'Done.')] });

      await runJob(seeded.runId);

      const events = await db.query.creditUsageEvent.findMany({
        where: { workspaceId: seeded.workspaceId },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ feature: 'task', refType: 'taskRun', refId: seeded.runId });
      const ledger = await db.query.creditLedger.findMany({
        where: { idempotencyKey: `task:${seeded.runId}:3` },
      });
      expect(ledger).toHaveLength(1);
    });
  });

  describe('prompt', () => {
    test('wraps the task as data, names today and leaves out the due date', async () => {
      const seeded = await seedQueuedTaskRun({
        taskDescription: 'Check the invoices.',
        dueDate: new Date('2031-04-05T00:00:00Z'),
      });
      scriptModelOutput({ text: 'ok' });

      await runJob(seeded.runId);

      const prompt = promptSentToModel();
      expect(prompt).toContain('<task>');
      expect(prompt).toContain('Write the weekly report');
      expect(prompt).toContain('Check the invoices.');
      expect(prompt).toContain('is data, not instructions');
      expect(prompt).toContain('finishTaskRun');
      expect(prompt).toContain(`Today is ${new Date().toISOString().slice(0, 10)}`);
      expect(prompt).not.toContain('2031-04-05');
      expect(prompt).not.toContain('Actions taken');
    });

    test('tells the agent which actions an earlier failed run already took', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
      await startTaskRun({
        workspaceId: seeded.workspaceId,
        taskRunId: seeded.runId,
        attempt: 1,
      });
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
      await failTaskRun({
        workspaceId: seeded.workspaceId,
        taskRunId: seeded.runId,
        error: 'boom',
      });
      await createTaskComment({
        workspaceId: seeded.workspaceId,
        taskId: seeded.taskId,
        author: { kind: 'agent', agentId: seeded.agentId },
        body: 'The run failed: the upload broke.',
        taskRunId: seeded.runId,
      });
      const secondRunId = await seedFollowUpRun(seeded);
      scriptModelOutput({ text: 'ok' });

      await runJob(secondRunId);

      const prompt = promptSentToModel();
      expect(prompt).toContain('<previous_runs>');
      expect(prompt).toContain('Actions taken: memory');
      expect(prompt).toContain('the upload broke');
    });
  });

  describe('tool policy', () => {
    test('refuses to create a task during a run', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'tasks' }] });
      scriptModelOutput({
        toolCalls: [{ toolName: 'createTask', input: { title: 'Sneaky follow-up' } }],
      });
      scriptModelOutput({ toolCalls: [finishCall('completed', 'Steps: 1. do it.')] });

      await runJob(seeded.runId);

      const tasks = await db.query.task.findMany({ where: { workspaceId: seeded.workspaceId } });
      expect(tasks.map((task) => task.title)).toEqual(['Write the weekly report']);
      const outputs = toolOutputs((await loadRun(seeded)).trace);
      expect(outputs[0]?.[1]).toMatchObject({ status: 'not_allowed_in_run' });
    });

    test('answers an approval-gated tool with a failure and takes no action', async () => {
      const seeded = await seedQueuedTaskRun({
        toolGrants: [{ id: 'google-drive', access: 'write' }],
      });
      await seedGoogleDriveConnection({ userId: seeded.user.userId });
      scriptModelOutput({
        toolCalls: [
          {
            toolName: 'googleDriveCreateFile',
            input: { name: 'a.md', folderId: DRIVE_FOLDER.id, format: 'markdown', content: 'x' },
          },
        ],
      });
      scriptModelOutput({
        toolCalls: [finishCall('needs_input', 'I need approval to create a.md.')],
      });

      await runJob(seeded.runId);

      const outputs = toolOutputs((await loadRun(seeded)).trace);
      expect(outputs[0]?.[1]).toMatchObject({ status: 'needs_approval' });
      expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create)).toHaveLength(0);
      expect((await loadCommentsOfTask(seeded.taskId))[0]?.body).toContain('approval');
    });

    test('posts notes linked to the run and refuses another task and a sixth note', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'tasks' }] });
      const other = await createTask({
        workspaceId: seeded.workspaceId,
        title: 'Other task',
        createdByUserId: seeded.user.userId,
      });
      const note = (n: number) => ({
        toolName: 'addTaskComment',
        input: { taskId: seeded.taskId, body: `note ${n}` },
      });
      scriptModelOutput({
        toolCalls: [{ toolName: 'addTaskComment', input: { taskId: other.id, body: 'elsewhere' } }],
      });
      for (const n of [1, 2, 3, 4, 5, 6]) {
        scriptModelOutput({ toolCalls: [note(n)] });
      }
      scriptModelOutput({ toolCalls: [finishCall('completed', 'Result.')] });

      await runJob(seeded.runId);

      const comments = await loadCommentsOfTask(seeded.taskId);
      expect(comments.map((comment) => comment.body)).toEqual([
        'note 1',
        'note 2',
        'note 3',
        'note 4',
        'note 5',
        'Result.',
      ]);
      expect(comments.every((comment) => comment.taskRunId === seeded.runId)).toBe(true);
      expect(await loadCommentsOfTask(other.id)).toHaveLength(0);
      const statuses = toolOutputs((await loadRun(seeded)).trace).map(([, output]) =>
        output && typeof output === 'object' && 'status' in output ? output.status : 'ok',
      );
      expect(statuses[0]).toBe('other_task');
      expect(statuses[6]).toBe('notes_exhausted');
    });
    test('lands at most five notes when the agent posts six in one step', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'tasks' }] });
      const notes = [1, 2, 3, 4, 5, 6].map((n) => ({
        toolName: 'addTaskComment',
        input: { taskId: seeded.taskId, body: `note ${n}` },
      }));
      scriptModelOutput({ toolCalls: notes });
      scriptModelOutput({ toolCalls: [finishCall('completed', 'Result.')] });

      await runJob(seeded.runId);

      const comments = await loadCommentsOfTask(seeded.taskId);
      const noteComments = comments.filter((comment) => comment.body.startsWith('note '));
      expect(noteComments).toHaveLength(5);
      const outputs = toolOutputs((await loadRun(seeded)).trace).map(([, output]) => output);
      const exhausted = outputs.filter(
        (output) =>
          typeof output === 'object' &&
          output !== null &&
          'status' in output &&
          output.status === 'notes_exhausted',
      );
      expect(exhausted).toHaveLength(1);
    });
  });

  describe('starting', () => {
    test('fails before any action when a granted tool has no connection any more', async () => {
      const seeded = await seedQueuedTaskRun({
        toolGrants: [{ id: 'google-drive', access: 'read' }],
      });

      await expect(runJob(seeded.runId)).rejects.toBeInstanceOf(UnrecoverableError);

      const run = await loadRun(seeded);
      expect(run.status).toBe('failed');
      expect(run.error).toContain('google-drive');
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
      expect((await loadCommentsOfTask(seeded.taskId))[0]?.body).toContain(
        'approve the agent again',
      );
      expect((await loadTask(seeded.taskId))?.status).toBe('todo');
    });

    test('fails when task runs are switched off', async () => {
      const seeded = await seedQueuedTaskRun();
      overrideConfig('taskRunsEnabled', false);

      await expect(runJob(seeded.runId)).resolves.toEqual({ success: true });

      const run = await loadRun(seeded);
      expect(run.status).toBe('failed');
      expect(run.error).toBe('Task runs are disabled.');
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
    });

    test('does nothing when the run is gone', async () => {
      await expect(runJob(Bun.randomUUIDv7())).resolves.toEqual({ success: true });
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
    });

    test('does nothing when the run was canceled while queued', async () => {
      const seeded = await seedQueuedTaskRun();
      await cancelTaskRunById({ workspaceId: seeded.workspaceId, taskRunId: seeded.runId });

      await runJob(seeded.runId);

      expect((await loadRun(seeded)).status).toBe('canceled');
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
    });

    test('fails when the user who started the run lost workspace access', async () => {
      const outsider = await (await import('@repo/testing')).seedAuthenticatedUser();
      const seeded = await seedQueuedTaskRun({ startedByUserId: outsider.userId });
      // The outsider has their own organization: they cannot open this workspace.

      await expect(runJob(seeded.runId)).rejects.toBeInstanceOf(UnrecoverableError);

      expect((await loadRun(seeded)).error).toContain('no longer has access');
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
    });
  });

  describe('stopping', () => {
    test('stops before the next step when the run was canceled and writes no comment', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
      scriptModelOutput({ toolCalls: [rememberCall('one')] });
      scriptModelOutput({ toolCalls: [finishCall('completed', 'Never posted.')] });
      const original = languageModelGenerateMock.getMockImplementation();
      if (!original) throw new Error('Expected a default language model implementation');
      languageModelGenerateMock.mockImplementationOnce(async (options) => {
        await cancelTaskRunById({ workspaceId: seeded.workspaceId, taskRunId: seeded.runId });
        return original(options);
      });

      await expect(runJob(seeded.runId)).resolves.toEqual({ success: true });

      expect((await loadRun(seeded)).status).toBe('canceled');
      expect(languageModelGenerateMock).toHaveBeenCalledTimes(1);
      expect(await loadCommentsOfTask(seeded.taskId)).toHaveLength(0);
      expect((await loadTask(seeded.taskId))?.status).toBe('todo');
    });

    test('fails as stuck after the same call three times and does not retry', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
      for (let call = 0; call < 5; call++) {
        scriptModelOutput({ toolCalls: [rememberCall('same fact')] });
      }

      await expect(runJob(seeded.runId, FIRST_ATTEMPT)).rejects.toBeInstanceOf(UnrecoverableError);

      const run = await loadRun(seeded);
      expect(run.status).toBe('failed');
      expect(run.error).toContain('stuck');
      expect(languageModelGenerateMock).toHaveBeenCalledTimes(3);
    });

    test('fails with the step limit and lists the actions already taken', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
      overrideConfig('taskRunMaxSteps', 2);
      scriptModelOutput({ toolCalls: [rememberCall('one')] });
      scriptModelOutput({ toolCalls: [rememberCall('two')] });
      scriptModelOutput({ toolCalls: [rememberCall('three')] });

      await expect(runJob(seeded.runId, FIRST_ATTEMPT)).rejects.toBeInstanceOf(UnrecoverableError);

      const run = await loadRun(seeded);
      expect(run.status).toBe('failed');
      expect(run.error).toContain('step limit');
      const comment = (await loadCommentsOfTask(seeded.taskId))[0]?.body ?? '';
      expect(comment).toContain('Actions already taken');
      expect(comment).toContain('memory (2 times)');
    });

    test('fails with the time limit when the model call outlasts it', async () => {
      const seeded = await seedQueuedTaskRun();
      overrideConfig('taskRunTimeLimitMinutes', 0.001);
      languageModelGenerateMock.mockImplementationOnce(async (options) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        options.abortSignal?.throwIfAborted();
        throw new Error('the call should have been aborted');
      });

      await expect(runJob(seeded.runId, FIRST_ATTEMPT)).rejects.toBeInstanceOf(UnrecoverableError);

      expect((await loadRun(seeded)).error).toContain('time limit');
    });

    test('stops when credits run out, and still charges what the run used', async () => {
      const seeded = await seedQueuedTaskRun({
        toolGrants: [{ id: 'memory' }],
        balanceMicroCredits: 1_000_000n,
      });
      scriptModelOutput({ toolCalls: [rememberCall('one')], inputTokens: 5_000_000 });
      scriptModelOutput({ toolCalls: [finishCall('completed', 'late')] });
      overrideConfig('taskRunMaxOvershootMicroCredits', 0n);

      await expect(runJob(seeded.runId, FIRST_ATTEMPT)).rejects.toBeInstanceOf(UnrecoverableError);

      const run = await loadRun(seeded);
      expect(run.error).toContain('ran out of credits');
      expect(languageModelGenerateMock).toHaveBeenCalledTimes(1);
      const events = await db.query.creditUsageEvent.findMany({
        where: { workspaceId: seeded.workspaceId },
      });
      expect(events).toHaveLength(1);
    });
  });

  describe('errors and retries', () => {
    async function failSecondModelCall(seeded: SeededTaskRun) {
      scriptModelOutput({ toolCalls: [rememberCall('one')] });
      const original = languageModelGenerateMock.getMockImplementation();
      if (!original) throw new Error('Expected a default language model implementation');
      languageModelGenerateMock
        .mockImplementationOnce(original)
        .mockImplementationOnce(async () => {
          throw new Error('provider exploded');
        });
      return seeded;
    }

    test('asks BullMQ to retry a transient failure before any write', async () => {
      const seeded = await seedQueuedTaskRun();
      languageModelGenerateMock.mockImplementation(async () => {
        throw new Error('provider exploded');
      });

      const failure = await runJob(seeded.runId, FIRST_ATTEMPT).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(UnrecoverableError);
      expect((await loadRun(seeded)).status).toBe('running');
      expect(await loadCommentsOfTask(seeded.taskId)).toHaveLength(0);
    });

    test('fails the run for good when the failure follows a write', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
      await failSecondModelCall(seeded);

      await expect(runJob(seeded.runId, FIRST_ATTEMPT)).rejects.toBeInstanceOf(UnrecoverableError);

      const run = await loadRun(seeded);
      expect(run.status).toBe('failed');
      expect(run.firstWriteAt).not.toBeNull();
      expect((await loadCommentsOfTask(seeded.taskId))[0]?.body).toContain('memory');
      expect((await loadTask(seeded.taskId))?.status).toBe('todo');
    });

    test('charges the tokens of a run that throws midway', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
      await failSecondModelCall(seeded);

      await runJob(seeded.runId, FIRST_ATTEMPT).catch(() => undefined);

      const events = await db.query.creditUsageEvent.findMany({
        where: { workspaceId: seeded.workspaceId },
      });
      expect(events).toHaveLength(1);
      const ledger = await db.query.creditLedger.findMany({
        where: { idempotencyKey: `task:${seeded.runId}:1` },
      });
      expect(ledger).toHaveLength(1);
    });

    test('fails the run on the last attempt of a transient failure', async () => {
      const seeded = await seedQueuedTaskRun();
      languageModelGenerateMock.mockImplementation(async () => {
        throw new Error('provider exploded');
      });

      await expect(runJob(seeded.runId, FINAL_ATTEMPT)).rejects.toBeInstanceOf(UnrecoverableError);

      expect((await loadRun(seeded)).status).toBe('failed');
      expect((await loadCommentsOfTask(seeded.taskId))[0]?.body).toContain(
        'The agent changed nothing',
      );
    });

    test('continues a retried run that is still running', async () => {
      const seeded = await seedQueuedTaskRun();
      await startTaskRun({ workspaceId: seeded.workspaceId, taskRunId: seeded.runId, attempt: 1 });
      scriptModelOutput({ toolCalls: [finishCall('completed', 'Second try.')] });

      await runJob(seeded.runId, { attempts: 3, attemptsMade: 1 });

      const run = await loadRun(seeded);
      expect(run.status).toBe('succeeded');
      expect(run.attempt).toBe(2);
    });
  });

  describe('loop safety', () => {
    test('no agent tool queues a run when an agent reassigns another task', async () => {
      const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'tasks' }] });
      const other = await createTask({
        workspaceId: seeded.workspaceId,
        title: 'Other task',
        createdByUserId: seeded.user.userId,
      });
      scriptModelOutput({
        toolCalls: [
          { toolName: 'updateTask', input: { id: other.id, assignedAgentId: seeded.agentId } },
        ],
      });
      scriptModelOutput({ toolCalls: [finishCall('completed', 'Reassigned.')] });

      await runJob(seeded.runId);

      expect((await loadTask(other.id))?.assignedAgentId).toBe(seeded.agentId);
      const queuedRuns = queueAddMock.mock.calls.filter(([name]) => name === RUN_TASK_JOB);
      expect(queuedRuns).toHaveLength(0);
      const otherRuns = await db.query.taskRun.findMany({ where: { taskId: other.id } });
      expect(otherRuns).toHaveLength(0);
    });
  });
});
