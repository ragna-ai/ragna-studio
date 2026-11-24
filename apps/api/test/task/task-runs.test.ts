import { taskRunToolDefinitions, taskToolDefinitions } from '@repo/ai';
import {
  approveAgent,
  cancelActiveTaskRunsInWorkspace,
  createTask,
  createTaskComment,
  createTaskRun,
  db,
  failStaleTaskRuns,
  failTaskRun,
  sql,
  startTaskRun,
  succeedTaskRun,
  type TaskRun,
} from '@repo/database';
import { agent, task, taskComment, taskRun as taskRunTable } from '@repo/database/schema';
import { config } from '@repo/config';
import {
  enqueuedJobs,
  queueAddMock,
  resetProviderMocks,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { RUN_TASK_JOB } from '@repo/queue';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { agentRoutes, expectProblem } from '../agent/agent-lock-fixtures';
import {
  insertWorkspaceMember,
  seedOrganizationWithRoles,
  type OrganizationWithRoles,
} from '../workspace/workspace-access-fixtures';

const ENOUGH_MICRO_CREDITS = 1_000_000_000n;

type TaskRunConfigKey =
  | 'taskRunsEnabled'
  | 'taskRunMaxActivePerWorkspace'
  | 'taskRunMinMicroCredits';

const overriddenConfigKeys = new Set<TaskRunConfigKey>();

/** Shadows a config getter on the instance until `afterEach` restores it. */
function overrideConfig(key: TaskRunConfigKey, value: boolean | number | bigint): void {
  Object.defineProperty(config, key, { get: () => value, configurable: true });
  overriddenConfigKeys.add(key);
}

afterEach(() => {
  for (const key of overriddenConfigKeys) Reflect.deleteProperty(config, key);
  overriddenConfigKeys.clear();
});

const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, credits: 0 };

const boardTaskSchema = z.object({
  id: z.string(),
  status: z.string(),
  activeRun: z.strictObject({ id: z.string(), status: z.string() }).nullable(),
});
const boardSchema = z.object({ tasks: z.array(boardTaskSchema) });

interface Fixture {
  org: OrganizationWithRoles;
  workspaceId: string;
  userId: string;
  agentId: string;
  agentVersionId: string;
  taskId: string;
}

async function insertApprovedAgent(workspaceId: string, userId: string, name: string) {
  const { aiModelId } = await seedTokenPricedAiModel();
  const [row] = await db
    .insert(agent)
    .values({ userId, workspaceId, aiModelId, name, systemPrompt: 'x', icon: 'bot', tone: 'blue' })
    .returning({ id: agent.id });
  if (!row) throw new Error('agent not inserted');
  const approval = await approveAgent({ agentId: row.id, workspaceId, userId });
  if (approval.status !== 'approved') throw new Error(`agent not approved: ${approval.status}`);
  return { agentId: row.id, agentVersionId: approval.version.id };
}

async function seedFixture(): Promise<Fixture> {
  const org = await seedOrganizationWithRoles();
  const { workspaceId, userId } = org.owner;
  await seedCreditAccount({ userId, balanceMicroCredits: ENOUGH_MICRO_CREDITS });
  const { agentId, agentVersionId } = await insertApprovedAgent(workspaceId, userId, 'Helper');
  const created = await createTask({
    workspaceId,
    title: 'A task',
    status: 'todo',
    createdByUserId: userId,
    assignedAgentId: agentId,
  });
  return { org, workspaceId, userId, agentId, agentVersionId, taskId: created.id };
}

async function startRun(fixture: Fixture, taskId = fixture.taskId): Promise<TaskRun> {
  const result = await createTaskRun({
    workspaceId: fixture.workspaceId,
    taskId,
    agentId: fixture.agentId,
    agentVersionId: fixture.agentVersionId,
    startedByUserId: fixture.userId,
  });
  if (result.status !== 'created') throw new Error(`run not created: ${result.status}`);
  return result.run;
}

async function taskStatus(taskId: string) {
  const row = await db.query.task.findFirst({ where: { id: taskId } });
  return row?.status;
}

async function runStatus(runId: string) {
  const row = await db.query.taskRun.findFirst({ where: { id: runId } });
  return row?.status;
}

function taskRequest(fixture: Fixture, path: string, method: string, body?: object) {
  return app.request(`/workspace/${fixture.workspaceId}/task${path}`, {
    method,
    headers: { cookie: fixture.org.owner.cookieHeader, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function succeed(fixture: Fixture, run: TaskRun, outcome: 'completed' | 'needs_input') {
  return succeedTaskRun({
    workspaceId: fixture.workspaceId,
    taskRunId: run.id,
    outcome,
    trace: [],
    usage: EMPTY_USAGE,
  });
}

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
});

const agentSummarySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  tone: z.string().nullable(),
});

const runSchema = z.strictObject({
  id: z.string(),
  taskId: z.string(),
  status: z.string(),
  outcome: z.enum(['completed', 'needs_input']).nullable(),
  error: z.string().nullable(),
  agent: agentSummarySchema.nullable(),
  agentVersion: z.strictObject({ id: z.string(), versionNumber: z.number() }).nullable(),
  startedBy: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
  trace: z.array(z.unknown()),
  usage: z
    .strictObject({ inputTokens: z.number(), outputTokens: z.number(), credits: z.number() })
    .nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});
const runResponseSchema = z.strictObject({ run: runSchema });
const runListSchema = z.strictObject({ runs: z.array(runSchema) });
const cancelAllSchema = z.strictObject({ canceledCount: z.number() });

function startRunRequest(fixture: Fixture, body: object = {}, taskId = fixture.taskId) {
  return taskRequest(fixture, `/${taskId}/runs`, 'POST', body);
}

describe('creating a task run', () => {
  test('queues the run and moves the task to in progress', async () => {
    const fixture = await seedFixture();

    const run = await startRun(fixture);

    expect(run.status).toBe('queued');
    expect(run.previousTaskStatus).toBe('todo');
    expect(await taskStatus(fixture.taskId)).toBe('in_progress');
  });

  test('refuses a second active run on the same task', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const second = await createTaskRun({
      workspaceId: fixture.workspaceId,
      taskId: fixture.taskId,
      agentId: fixture.agentId,
      agentVersionId: fixture.agentVersionId,
      startedByUserId: fixture.userId,
    });

    expect(second).toEqual({ status: 'run-active' });
  });
});

describe('task lock while a run is active', () => {
  test('refuses an edit with 409 and leaves the task unchanged', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}`, 'PATCH', { title: 'New' });

    expect(response.status).toBe(StatusCodes.CONFLICT);
    const row = await db.query.task.findFirst({ where: { id: fixture.taskId } });
    expect(row?.title).toBe('A task');
  });

  test('refuses a move with 409', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}/move`, 'POST', {
      status: 'done',
    });

    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await taskStatus(fixture.taskId)).toBe('in_progress');
  });

  test('reassigning the agent cancels the run and restores the task status', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    const other = await insertApprovedAgent(fixture.workspaceId, fixture.userId, 'Other');

    const response = await taskRequest(fixture, `/${fixture.taskId}`, 'PATCH', {
      assignedAgentId: other.agentId,
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(await runStatus(run.id)).toBe('canceled');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });

  test('a task tool reports the lock as a failure', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);
    const updateTaskTool = taskToolDefinitions({ agentId: fixture.agentId }).find(
      ({ name }) => name === 'updateTask',
    );

    const result = await updateTaskTool?.execute(
      { id: fixture.taskId, title: 'New' },
      { userId: fixture.userId, workspaceId: fixture.workspaceId, origin: 'agent' },
    );

    expect(result).toMatchObject({ status: 'task_run_active' });
  });

  test('an agent tool cannot stop a run by reassigning the task', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    const other = await insertApprovedAgent(fixture.workspaceId, fixture.userId, 'Other');
    const updateTaskTool = taskToolDefinitions({ agentId: other.agentId }).find(
      ({ name }) => name === 'updateTask',
    );

    const result = await updateTaskTool?.execute(
      { id: fixture.taskId, assignedAgentId: other.agentId },
      { userId: fixture.userId, workspaceId: fixture.workspaceId, origin: 'agent' },
    );

    expect(result).toMatchObject({ status: 'task_run_active' });
    expect(await runStatus(run.id)).toBe('queued');
  });

  test('user comments stay open', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}/comments`, 'POST', {
      body: 'Hello',
    });

    expect(response.status).toBe(StatusCodes.CREATED);
  });
});

describe('GET /workspace/:workspaceId/task', () => {
  test('shows the active run on its task and null elsewhere', async () => {
    const fixture = await seedFixture();
    const otherTask = await createTask({ workspaceId: fixture.workspaceId, title: 'Idle' });
    const run = await startRun(fixture);

    const response = await taskRequest(fixture, '', 'GET');

    const { tasks } = boardSchema.parse(await response.json());
    expect(tasks.find(({ id }) => id === fixture.taskId)?.activeRun).toEqual({
      id: run.id,
      status: 'queued',
    });
    expect(tasks.find(({ id }) => id === otherTask.id)?.activeRun).toBeNull();
  });

  test('shows no active run once the run is finished', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await failTaskRun({ workspaceId: fixture.workspaceId, taskRunId: run.id, error: 'x' });

    const response = await taskRequest(fixture, '', 'GET');

    const { tasks } = boardSchema.parse(await response.json());
    expect(tasks.find(({ id }) => id === fixture.taskId)?.activeRun).toBeNull();
  });
});

describe('run lifecycle', () => {
  test.each([
    ['completed', 'in_review'],
    ['needs_input', 'todo'],
  ] as const)('outcome %s leaves the task %s', async (outcome, expectedStatus) => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await markRunning(run);

    const won = await succeed(fixture, run, outcome);

    expect(won).toBe(true);
    expect(await runStatus(run.id)).toBe('succeeded');
    expect(await taskStatus(fixture.taskId)).toBe(expectedStatus);
  });

  test('a failed run restores the previous task status', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    const won = await failTaskRun({
      workspaceId: fixture.workspaceId,
      taskRunId: run.id,
      error: 'boom',
    });

    expect(won).toBe(true);
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });

  test('a late writer cannot overwrite a canceled run', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await markRunning(run);
    await cancelActiveTaskRunsInWorkspace({ workspaceId: fixture.workspaceId });

    const won = await succeed(fixture, run, 'completed');

    expect(won).toBe(false);
    expect(await runStatus(run.id)).toBe('canceled');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });

  test('a status the user chose during the run wins', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await markRunning(run);
    await db
      .update(task)
      .set({ status: 'done' })
      .where(sql`${task.id} = ${fixture.taskId}`);

    await succeed(fixture, run, 'completed');

    expect(await taskStatus(fixture.taskId)).toBe('done');
  });

  test('the sweeper fails stale runs and restores the task', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    const future = new Date(Date.now() + 60_000);

    const failed = await failStaleTaskRuns({ queuedBefore: future, runningBefore: future });

    expect(failed.map(({ id }) => id)).toEqual([run.id]);
    expect(await runStatus(run.id)).toBe('failed');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });
});

async function markRunning(run: TaskRun) {
  const started = await startTaskRun({
    workspaceId: run.workspaceId,
    taskRunId: run.id,
    attempt: 1,
  });
  expect(started).toBe(true);
}

describe('comments of a run on a full task', () => {
  async function fillTaskWithComments(fixture: Fixture) {
    await db.insert(taskComment).values(
      Array.from({ length: 100 }, (_, index) => ({
        workspaceId: fixture.workspaceId,
        taskId: fixture.taskId,
        authorKind: 'user' as const,
        authorUserId: fixture.userId,
        body: `Comment ${index}`,
      })),
    );
  }

  function agentComment(fixture: Fixture, run: TaskRun, skipTaskCommentCap: boolean) {
    return createTaskComment({
      workspaceId: fixture.workspaceId,
      taskId: fixture.taskId,
      author: { kind: 'agent', agentId: fixture.agentId },
      body: 'Result',
      taskRunId: run.id,
      skipTaskCommentCap,
    });
  }

  test('the runner can still post its result', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await fillTaskWithComments(fixture);

    const result = await agentComment(fixture, run, true);

    expect(result.status).toBe('created');
  });

  test('a note without the skip is refused', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await fillTaskWithComments(fixture);

    const result = await agentComment(fixture, run, false);

    expect(result).toEqual({ status: 'limit-reached' });
  });
});

describe('task run tools', () => {
  function runTools(fixture: Fixture, run: TaskRun) {
    return taskRunToolDefinitions({
      agentId: fixture.agentId,
      taskId: fixture.taskId,
      taskRunId: run.id,
    });
  }

  function execute(fixture: Fixture, run: TaskRun, name: string, input: Record<string, unknown>) {
    const definition = runTools(fixture, run).find((tool) => tool.name === name);
    if (!definition) throw new Error(`Missing ${name}`);
    return definition.execute(input, {
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
      origin: 'agent',
    });
  }

  test('a note is stored with the run it belongs to', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    await execute(fixture, run, 'addTaskComment', { taskId: fixture.taskId, body: 'Note' });

    const [comment] = await db.query.taskComment.findMany({ where: { taskId: fixture.taskId } });
    expect(comment?.taskRunId).toBe(run.id);
  });

  test('a note on another task is refused and nothing is written', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    const other = await createTask({ workspaceId: fixture.workspaceId, title: 'Other' });

    const result = await execute(fixture, run, 'addTaskComment', {
      taskId: other.id,
      body: 'Note',
    });

    expect(result).toMatchObject({ status: 'other_task' });
    expect(await db.select().from(taskComment)).toHaveLength(0);
  });

  test('the sixth note of a run is refused', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    for (let note = 0; note < 5; note += 1) {
      await execute(fixture, run, 'addTaskComment', { taskId: fixture.taskId, body: `N${note}` });
    }

    const result = await execute(fixture, run, 'addTaskComment', {
      taskId: fixture.taskId,
      body: 'Sixth',
    });

    expect(result).toMatchObject({ status: 'notes_exhausted' });
    expect(await db.select().from(taskComment)).toHaveLength(5);
  });

  test('parallel notes never exceed the cap', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    await Promise.all(
      Array.from({ length: 8 }, (_, note) =>
        execute(fixture, run, 'addTaskComment', { taskId: fixture.taskId, body: `N${note}` }),
      ),
    );

    expect(await db.select().from(taskComment)).toHaveLength(5);
  });

  test('finishTaskRun echoes the outcome and summary', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    const result = await execute(fixture, run, 'finishTaskRun', {
      outcome: 'completed',
      summary: 'Done',
    });

    expect(result).toEqual({ outcome: 'completed', summary: 'Done' });
  });

  test('creating a task is refused while the agent works a run', async () => {
    const fixture = await seedFixture();
    const createTaskTool = taskToolDefinitions({
      agentId: fixture.agentId,
      inTaskRun: true,
    }).find(({ name }) => name === 'createTask');

    const result = await createTaskTool?.execute(
      { title: 'Subtask' },
      { userId: fixture.userId, workspaceId: fixture.workspaceId, origin: 'agent' },
    );

    expect(result).toMatchObject({ status: 'not_allowed_in_run' });
    expect(
      await db.query.task.findMany({ where: { workspaceId: fixture.workspaceId } }),
    ).toHaveLength(1);
  });
});

describe('POST /task/:taskId/runs', () => {
  test('starts the run, queues the job and returns the run', async () => {
    const fixture = await seedFixture();

    const response = await startRunRequest(fixture);

    expect(response.status).toBe(StatusCodes.CREATED);
    const { run } = runResponseSchema.parse(await response.json());
    expect(run).toMatchObject({
      taskId: fixture.taskId,
      status: 'queued',
      outcome: null,
      agent: { id: fixture.agentId, name: 'Helper' },
      agentVersion: { id: fixture.agentVersionId, versionNumber: 1 },
      startedBy: { id: fixture.userId },
    });
    expect(enqueuedJobs(RUN_TASK_JOB).map(([, data]) => data)).toEqual([{ taskRunId: run.id }]);
    expect(enqueuedJobs(RUN_TASK_JOB).map(([, , options]) => options)).toEqual([{ jobId: run.id }]);
    expect(await taskStatus(fixture.taskId)).toBe('in_progress');
  });

  test('assigns the given agent first and runs it', async () => {
    const fixture = await seedFixture();
    const other = await insertApprovedAgent(fixture.workspaceId, fixture.userId, 'Other');

    const response = await startRunRequest(fixture, { agentId: other.agentId });

    expect(response.status).toBe(StatusCodes.CREATED);
    const { run } = runResponseSchema.parse(await response.json());
    expect(run.agent?.id).toBe(other.agentId);
    const row = await db.query.task.findFirst({ where: { id: fixture.taskId } });
    expect(row?.assignedAgentId).toBe(other.agentId);
  });

  test('refuses an agent of another workspace with 404', async () => {
    const fixture = await seedFixture();
    const foreign = await seedFixture();

    const response = await startRunRequest(fixture, { agentId: foreign.agentId });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('refuses a task without an agent', async () => {
    const fixture = await seedFixture();
    const bare = await createTask({ workspaceId: fixture.workspaceId, title: 'Bare' });

    const response = await startRunRequest(fixture, {}, bare.id);

    await expectProblem(response, StatusCodes.CONFLICT, 'task-has-no-agent');
    expect(enqueuedJobs(RUN_TASK_JOB)).toHaveLength(0);
  });

  test('refuses an agent without a live approval', async () => {
    const fixture = await seedFixture();
    await db
      .update(agent)
      .set({ lockedVersionId: null })
      .where(sql`${agent.id} = ${fixture.agentId}`);

    const response = await startRunRequest(fixture);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-not-approved');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });

  test('refuses while the balance is below the minimum', async () => {
    const fixture = await seedFixture();
    overrideConfig('taskRunMinMicroCredits', ENOUGH_MICRO_CREDITS * 2n);

    const response = await startRunRequest(fixture);

    await expectProblem(response, StatusCodes.PAYMENT_REQUIRED, 'out-of-credits');
    expect(enqueuedJobs(RUN_TASK_JOB)).toHaveLength(0);
  });

  test('refuses the run past the workspace limit', async () => {
    const fixture = await seedFixture();
    overrideConfig('taskRunMaxActivePerWorkspace', 1);
    await startRun(fixture);
    const second = await createTask({
      workspaceId: fixture.workspaceId,
      title: 'Second',
      assignedAgentId: fixture.agentId,
    });

    const response = await startRunRequest(fixture, {}, second.id);

    await expectProblem(response, StatusCodes.TOO_MANY_REQUESTS, 'task-run-limit-reached');
    expect(await taskStatus(second.id)).toBe('todo');
  });

  test('refuses a second run on the same task', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await startRunRequest(fixture);

    await expectProblem(response, StatusCodes.CONFLICT, 'task-run-active');
  });

  test('refuses while agent runs are switched off', async () => {
    const fixture = await seedFixture();
    overrideConfig('taskRunsEnabled', false);

    const response = await startRunRequest(fixture);

    await expectProblem(response, StatusCodes.SERVICE_UNAVAILABLE, 'task-runs-disabled');
  });

  test('fails the run and restores the task when queueing throws', async () => {
    const fixture = await seedFixture();
    queueAddMock.mockRejectedValueOnce(new Error('redis down'));

    const response = await startRunRequest(fixture);

    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    const [row] = await db.select().from(taskRunTable);
    expect(row?.status).toBe('failed');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });

  test('answers 404 for an unknown task', async () => {
    const fixture = await seedFixture();

    const response = await startRunRequest(fixture, {}, '0197c3a0-0000-7000-8000-000000000000');

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('the task lock answers with a typed problem', () => {
  test('an edit during a run is task-run-active', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}`, 'PATCH', { title: 'New' });

    await expectProblem(response, StatusCodes.CONFLICT, 'task-run-active');
  });

  test('a move during a run is task-run-active', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}/move`, 'POST', {
      status: 'done',
    });

    await expectProblem(response, StatusCodes.CONFLICT, 'task-run-active');
  });

  test('uploading an attachment during a run is task-run-active', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);
    const formData = new FormData();
    formData.append('files', new File(['hello'], 'note.txt', { type: 'text/plain' }));

    const response = await app.request(
      `/workspace/${fixture.workspaceId}/task/${fixture.taskId}/attachments`,
      { method: 'POST', headers: { cookie: fixture.org.owner.cookieHeader }, body: formData },
    );

    await expectProblem(response, StatusCodes.CONFLICT, 'task-run-active');
  });

  test('deleting an attachment during a run is task-run-active', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await taskRequest(
      fixture,
      `/${fixture.taskId}/attachments/0197c3a0-0000-7000-8000-000000000000`,
      'DELETE',
    );

    await expectProblem(response, StatusCodes.CONFLICT, 'task-run-active');
  });

  test('deleting the task during a run stays allowed', async () => {
    const fixture = await seedFixture();
    await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}`, 'DELETE');

    expect(response.status).toBe(StatusCodes.OK);
  });
});

describe('GET /task/:taskId', () => {
  test('carries the active run', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}`, 'GET');

    const body = z
      .object({
        task: z.looseObject({
          activeRun: z.strictObject({ id: z.string(), status: z.string() }).nullable(),
        }),
      })
      .parse(await response.json());
    expect(body.task.activeRun).toEqual({ id: run.id, status: 'queued' });
  });
});

describe('GET /task/:taskId/runs', () => {
  test('lists the runs newest first with agent, version and starter', async () => {
    const fixture = await seedFixture();
    const first = await startRun(fixture);
    await failTaskRun({ workspaceId: fixture.workspaceId, taskRunId: first.id, error: 'boom' });
    const second = await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}/runs`, 'GET');

    expect(response.status).toBe(StatusCodes.OK);
    const { runs } = runListSchema.parse(await response.json());
    expect(runs.map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(runs[1]).toMatchObject({
      status: 'failed',
      error: 'boom',
      agent: { id: fixture.agentId, name: 'Helper' },
      agentVersion: { versionNumber: 1 },
      startedBy: { id: fixture.userId },
    });
  });

  test('shows a deleted agent as null', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await db
      .update(taskRunTable)
      .set({ agentId: null })
      .where(sql`${taskRunTable.id} = ${run.id}`);

    const response = await taskRequest(fixture, `/${fixture.taskId}/runs`, 'GET');

    const { runs } = runListSchema.parse(await response.json());
    expect(runs[0]?.agent).toBeNull();
  });
});

describe('POST /task/:taskId/runs/:taskRunId/cancel', () => {
  test('cancels the run and restores the task status', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    const response = await taskRequest(fixture, `/${fixture.taskId}/runs/${run.id}/cancel`, 'POST');

    expect(response.status).toBe(StatusCodes.OK);
    expect(runResponseSchema.parse(await response.json()).run.status).toBe('canceled');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });

  test('answers 409 for a run that already finished', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await failTaskRun({ workspaceId: fixture.workspaceId, taskRunId: run.id, error: 'x' });

    const response = await taskRequest(fixture, `/${fixture.taskId}/runs/${run.id}/cancel`, 'POST');

    expect(response.status).toBe(StatusCodes.CONFLICT);
  });

  test('answers 404 for an unknown run', async () => {
    const fixture = await seedFixture();

    const response = await taskRequest(
      fixture,
      `/${fixture.taskId}/runs/0197c3a0-0000-7000-8000-000000000000/cancel`,
      'POST',
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('answers 404 for a run of another task', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    const other = await createTask({ workspaceId: fixture.workspaceId, title: 'Other' });

    const response = await taskRequest(fixture, `/${other.id}/runs/${run.id}/cancel`, 'POST');

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await runStatus(run.id)).toBe('queued');
  });
});

describe('POST /task-runs/cancel-all', () => {
  function cancelAll(fixture: Fixture, cookieHeader: string) {
    return app.request(`/workspace/${fixture.workspaceId}/task-runs/cancel-all`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });
  }

  test('a manager stops every active run of the workspace', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    const response = await cancelAll(fixture, fixture.org.owner.cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    expect(cancelAllSchema.parse(await response.json())).toEqual({ canceledCount: 1 });
    expect(await runStatus(run.id)).toBe('canceled');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
  });

  test('an editor is refused with 403 and nothing stops', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    const { member } = fixture.org;
    await insertWorkspaceMember({
      workspaceId: fixture.workspaceId,
      userId: member.userId,
      role: 'editor',
    });

    const response = await cancelAll(fixture, member.cookieHeader);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await runStatus(run.id)).toBe('queued');
  });
});

describe('comments of a run', () => {
  test('carry the run they belong to and null otherwise', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    await db.insert(taskComment).values([
      {
        workspaceId: fixture.workspaceId,
        taskId: fixture.taskId,
        authorKind: 'agent',
        authorAgentId: fixture.agentId,
        taskRunId: run.id,
        body: 'Note',
      },
      {
        workspaceId: fixture.workspaceId,
        taskId: fixture.taskId,
        authorKind: 'user',
        authorUserId: fixture.userId,
        body: 'Hi',
      },
    ]);

    const response = await taskRequest(fixture, `/${fixture.taskId}/comments`, 'GET');

    const { comments } = z
      .object({
        comments: z.array(z.looseObject({ body: z.string(), taskRunId: z.string().nullable() })),
      })
      .parse(await response.json());
    expect(comments.map(({ body, taskRunId }) => [body, taskRunId])).toEqual(
      expect.arrayContaining([
        ['Note', run.id],
        ['Hi', null],
      ]),
    );
  });
});

describe('revoking the approval of an agent with active runs', () => {
  test('cancels its running and queued runs and restores their tasks', async () => {
    const fixture = await seedFixture();
    const secondTask = await createTask({
      workspaceId: fixture.workspaceId,
      title: 'Second',
      assignedAgentId: fixture.agentId,
    });
    const running = await startRun(fixture);
    await markRunning(running);
    const queued = await startRun(fixture, secondTask.id);
    const routes = agentRoutes({ workspaceId: fixture.workspaceId, agentId: fixture.agentId });

    const response = await routes.revoke(fixture.org.owner);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await runStatus(running.id)).toBe('canceled');
    expect(await runStatus(queued.id)).toBe('canceled');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
    expect(await taskStatus(secondTask.id)).toBe('todo');
  });
});

describe('unlocking an agent with active runs', () => {
  test('is refused without stopRuns and the run keeps going', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);
    const routes = agentRoutes({ workspaceId: fixture.workspaceId, agentId: fixture.agentId });

    const response = await routes.unlock(fixture.org.owner);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-has-active-task-runs');
    expect(await runStatus(run.id)).toBe('queued');
  });

  test('with stopRuns cancels the runs, then unlocks', async () => {
    const fixture = await seedFixture();
    const run = await startRun(fixture);

    const response = await app.request(
      `/workspace/${fixture.workspaceId}/agent/${fixture.agentId}/lock?stopRuns=true`,
      { method: 'DELETE', headers: { cookie: fixture.org.owner.cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(await runStatus(run.id)).toBe('canceled');
    expect(await taskStatus(fixture.taskId)).toBe('todo');
    const row = await db.query.agent.findFirst({ where: { id: fixture.agentId } });
    expect(row?.lockedVersionId).toBeNull();
  });

  test('without active runs unlocks as before', async () => {
    const fixture = await seedFixture();
    const routes = agentRoutes({ workspaceId: fixture.workspaceId, agentId: fixture.agentId });

    const response = await routes.unlock(fixture.org.owner);

    expect(response.status).toBe(StatusCodes.OK);
  });
});
