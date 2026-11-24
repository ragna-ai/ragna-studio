import type { WorkflowAgentTraceStep } from '@repo/workflow';
import { and, count, desc, eq, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { EmptyFilter } from 'drizzle-orm/relations';
import { db } from '../db';
import { isUniqueViolationError } from '../errors';
import type {
  AgentVersion,
  Task,
  TaskLabel,
  TaskRun,
  TaskRunOutcome,
  TaskRunStatus,
  TaskRunUsage,
  TaskStatus,
} from '../schema';
import { task, taskRun, taskRunActiveStatuses } from '../schema';
import { moveTaskToBottomOfColumn, type TaskTransaction } from './task-column';

export type { TaskRun, TaskRunOutcome, TaskRunStatus, TaskRunUsage } from '../schema';
export {
  taskRunActiveStatuses,
  taskRunOutcomes,
  taskRunStatuses,
  taskRunStatusEnum,
} from '../schema';

type TaskRunExecutor = typeof db | TaskTransaction;

type TaskRunTarget = 'running' | 'succeeded' | 'failed' | 'canceled';

/** The statuses a run may leave when it moves to the key. A late writer never overwrites a terminal state. */
const TASK_RUN_ALLOWED_FROM: Record<TaskRunTarget, readonly TaskRunStatus[]> = {
  running: ['queued'],
  succeeded: ['running'],
  failed: ['queued', 'running'],
  canceled: ['queued', 'running'],
};

interface TaskRunChange {
  to: TaskRunTarget;
  outcome?: TaskRunOutcome;
  error?: string;
  attempt?: number;
  trace?: WorkflowAgentTraceStep[];
  usage?: TaskRunUsage;
}

function inActiveStatuses() {
  return inArray(taskRun.status, [...taskRunActiveStatuses]);
}

/** The one place that writes `task_runs.status`: updates the rows of `scope` that may make the move. */
async function transitionWhere(
  executor: TaskRunExecutor,
  scope: SQL | undefined,
  { to, outcome, error, attempt, trace, usage }: TaskRunChange,
): Promise<TaskRun[]> {
  const now = new Date();
  return executor
    .update(taskRun)
    .set({
      status: to,
      outcome,
      error,
      attempt,
      trace,
      usage,
      ...(to === 'running' ? { startedAt: now } : { finishedAt: now }),
    })
    .where(and(scope, inArray(taskRun.status, [...TASK_RUN_ALLOWED_FROM[to]])))
    .returning();
}

export interface TransitionTaskRunInput extends TaskRunChange {
  workspaceId: string;
  taskRunId: string;
}

/**
 * Moves one run to `to` if its current status allows it. Returns whether this call won.
 * It does not touch the task: use `startTaskRun`, `succeedTaskRun` or `failTaskRun` for that.
 */
export async function transitionTaskRun({
  workspaceId,
  taskRunId,
  ...change
}: TransitionTaskRunInput): Promise<boolean> {
  const moved = await transitionWhere(db, matchesTaskRun({ workspaceId, taskRunId }), change);
  return moved.length > 0;
}

function matchesTaskRun({ workspaceId, taskRunId }: { workspaceId: string; taskRunId: string }) {
  return and(eq(taskRun.id, taskRunId), eq(taskRun.workspaceId, workspaceId));
}

/** Task status a finished run leaves behind. The caller applies it only while the task is `in_progress`. */
function taskStatusAfterRun(run: TaskRun): TaskStatus {
  if (run.status === 'succeeded') {
    return run.outcome === 'needs_input' ? 'todo' : 'in_review';
  }
  return run.previousTaskStatus;
}

async function settleTasksOfRuns(tx: TaskTransaction, runs: TaskRun[]): Promise<void> {
  for (const run of runs) {
    const status = taskStatusAfterRun(run);
    if (status === 'in_progress') continue;
    await moveTaskToBottomOfColumn(tx, {
      workspaceId: run.workspaceId,
      taskId: run.taskId,
      status,
      onlyFromStatus: 'in_progress',
    });
  }
}

async function transitionAndSettle(
  scope: SQL | undefined,
  change: TaskRunChange,
  executor?: TaskTransaction,
) {
  const run = async (tx: TaskTransaction): Promise<TaskRun[]> => {
    const moved = await transitionWhere(tx, scope, change);
    await settleTasksOfRuns(tx, moved);
    return moved;
  };
  return executor ? run(executor) : db.transaction(run);
}

// START

export interface CreateTaskRunInput {
  workspaceId: string;
  taskId: string;
  agentId: string;
  agentVersionId: string;
  startedByUserId: string;
}

export type CreateTaskRunResult =
  | { status: 'created'; run: TaskRun }
  | { status: 'task-not-found' }
  | { status: 'run-active' };

/**
 * Inserts a `queued` run and moves the task to `in_progress` in one transaction. The task row is
 * locked first, so a parallel edit or start sees the result. A second active run for the task
 * hits the partial unique index and comes back as `run-active`.
 */
export async function createTaskRun(input: CreateTaskRunInput): Promise<CreateTaskRunResult> {
  const { workspaceId, taskId, agentId, agentVersionId, startedByUserId } = input;
  try {
    return await db.transaction(async (tx): Promise<CreateTaskRunResult> => {
      const [lockedTask] = await tx
        .select({ status: task.status })
        .from(task)
        .where(and(eq(task.id, taskId), eq(task.workspaceId, workspaceId)))
        .for('update');
      if (!lockedTask) return { status: 'task-not-found' };

      const [run] = await tx
        .insert(taskRun)
        .values({
          workspaceId,
          taskId,
          agentId,
          agentVersionId,
          startedByUserId,
          previousTaskStatus: lockedTask.status,
        })
        .returning();
      if (!run) throw new Error('Failed to insert task run');

      if (lockedTask.status !== 'in_progress') {
        await moveTaskToBottomOfColumn(tx, { workspaceId, taskId, status: 'in_progress' });
      }
      return { status: 'created', run };
    });
  } catch (error) {
    if (isUniqueViolationError(error)) return { status: 'run-active' };
    throw error;
  }
}

export async function countActiveTaskRuns({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(taskRun)
    .where(and(eq(taskRun.workspaceId, workspaceId), inActiveStatuses()));
  return row?.total ?? 0;
}

export async function countActiveTaskRunsOfAgent({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(taskRun)
    .where(
      and(eq(taskRun.workspaceId, workspaceId), eq(taskRun.agentId, agentId), inActiveStatuses()),
    );
  return row?.total ?? 0;
}

// READ

export interface TaskRunWithContext extends TaskRun {
  task: Task & { labels: TaskLabel[]; subtasks: Task[] };
  agentVersion: AgentVersion;
}

/**
 * Everything the worker needs to run a job, which carries only the run id. Not scoped by
 * workspace: the id comes from our own queue, and the row's own workspaceId scopes what follows.
 */
export async function getTaskRunWithContext({
  taskRunId,
}: {
  taskRunId: string;
}): Promise<TaskRunWithContext | null> {
  const found = await db.query.taskRun.findFirst({
    where: { id: taskRunId },
    with: {
      task: { with: { labels: true, subtasks: true } },
      agentVersion: true,
    },
  });
  return found ?? null;
}

export async function getTaskRunById({
  workspaceId,
  taskRunId,
}: {
  workspaceId: string;
  taskRunId: string;
}): Promise<TaskRun | null> {
  const found = await db.query.taskRun.findFirst({ where: { id: taskRunId, workspaceId } });
  return found ?? null;
}

export interface TaskRunWithRelations extends TaskRun {
  agent: { id: string; name: string; icon: string | null; tone: string | null } | null;
  agentVersion: { id: string; versionNumber: number };
  startedByUser: { id: string; name: string } | null;
}

/** Runs of the task with their agent, version and starter, newest first. One query, for the run list. */
export async function listTaskRunsWithRelations({
  workspaceId,
  taskId,
  taskRunId,
}: {
  workspaceId: string;
  taskId: string;
  taskRunId?: string;
}): Promise<TaskRunWithRelations[]> {
  return db.query.taskRun.findMany({
    where: { workspaceId, taskId, id: taskRunId ?? EmptyFilter },
    with: {
      agent: { columns: { id: true, name: true, icon: true, tone: true } },
      agentVersion: { columns: { id: true, versionNumber: true } },
      startedByUser: { columns: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc', id: 'desc' },
  });
}

/** Every run of the task, newest first. */
export async function listTaskRunsByTaskId({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}): Promise<TaskRun[]> {
  return db
    .select()
    .from(taskRun)
    .where(and(eq(taskRun.workspaceId, workspaceId), eq(taskRun.taskId, taskId)))
    .orderBy(desc(taskRun.createdAt), desc(taskRun.id));
}

export const PREVIOUS_TASK_RUNS_IN_PROMPT = 3;

/** The latest finished runs of the task (any end state), newest first, for the run prompt. */
export async function listRecentFinishedTaskRuns({
  workspaceId,
  taskId,
  limit = PREVIOUS_TASK_RUNS_IN_PROMPT,
}: {
  workspaceId: string;
  taskId: string;
  limit?: number;
}): Promise<TaskRun[]> {
  return db
    .select()
    .from(taskRun)
    .where(
      and(
        eq(taskRun.workspaceId, workspaceId),
        eq(taskRun.taskId, taskId),
        isNotNull(taskRun.finishedAt),
      ),
    )
    .orderBy(desc(taskRun.finishedAt), desc(taskRun.id))
    .limit(limit);
}

/** Id of the task's queued or running run, read inside the caller's transaction. */
export async function findActiveTaskRunId(
  tx: TaskTransaction,
  { workspaceId, taskId }: { workspaceId: string; taskId: string },
): Promise<string | null> {
  const [active] = await tx
    .select({ id: taskRun.id })
    .from(taskRun)
    .where(
      and(eq(taskRun.workspaceId, workspaceId), eq(taskRun.taskId, taskId), inActiveStatuses()),
    );
  return active?.id ?? null;
}

// CANCEL

/** What a cancel call stopped. Each run's task is back at its previous status unless a user moved it. */
export type CanceledTaskRuns = TaskRun[];

/** Cancels the task's active run inside the caller's transaction. Used when its agent is reassigned. */
export async function cancelActiveTaskRunOfTask(
  tx: TaskTransaction,
  { workspaceId, taskId }: { workspaceId: string; taskId: string },
): Promise<CanceledTaskRuns> {
  return transitionAndSettle(
    and(eq(taskRun.workspaceId, workspaceId), eq(taskRun.taskId, taskId)),
    { to: 'canceled' },
    tx,
  );
}

export async function cancelTaskRunById({
  workspaceId,
  taskRunId,
}: {
  workspaceId: string;
  taskRunId: string;
}): Promise<CanceledTaskRuns> {
  return transitionAndSettle(matchesTaskRun({ workspaceId, taskRunId }), { to: 'canceled' });
}

export async function cancelActiveTaskRunsOfAgent({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<CanceledTaskRuns> {
  return transitionAndSettle(
    and(eq(taskRun.workspaceId, workspaceId), eq(taskRun.agentId, agentId)),
    { to: 'canceled' },
  );
}

export async function cancelActiveTaskRunsInWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<CanceledTaskRuns> {
  return transitionAndSettle(eq(taskRun.workspaceId, workspaceId), { to: 'canceled' });
}

// WORKER

interface TaskRunScope {
  workspaceId: string;
  taskRunId: string;
}

/** `queued` to `running` at pickup. False when the run was canceled or finished meanwhile. */
export async function startTaskRun({
  workspaceId,
  taskRunId,
  attempt,
}: TaskRunScope & { attempt: number }): Promise<boolean> {
  return transitionTaskRun({ workspaceId, taskRunId, to: 'running', attempt });
}

export interface SaveTaskRunProgressInput extends TaskRunScope {
  trace?: WorkflowAgentTraceStep[];
  usage?: TaskRunUsage;
  attempt?: number;
  /** Set once: later calls keep the first value. */
  firstWriteAt?: Date;
}

/** Saves what a running attempt has done so far. Ignored once the run is no longer `running`. */
export async function saveTaskRunProgress({
  workspaceId,
  taskRunId,
  trace,
  usage,
  attempt,
  firstWriteAt,
}: SaveTaskRunProgressInput): Promise<void> {
  await db
    .update(taskRun)
    .set({
      trace,
      usage,
      attempt,
      firstWriteAt: firstWriteAt
        ? sql`coalesce(${taskRun.firstWriteAt}, ${firstWriteAt.toISOString()}::timestamp)`
        : undefined,
    })
    .where(and(matchesTaskRun({ workspaceId, taskRunId }), eq(taskRun.status, 'running')));
}

export interface SucceedTaskRunInput extends TaskRunScope {
  outcome: TaskRunOutcome;
  trace: WorkflowAgentTraceStep[];
  usage: TaskRunUsage;
}

/** `running` to `succeeded`, and the task to `in_review` or `todo` while it is still `in_progress`. */
export async function succeedTaskRun({
  workspaceId,
  taskRunId,
  ...result
}: SucceedTaskRunInput): Promise<boolean> {
  const moved = await transitionAndSettle(matchesTaskRun({ workspaceId, taskRunId }), {
    to: 'succeeded',
    ...result,
  });
  return moved.length > 0;
}

export interface FailTaskRunInput extends TaskRunScope {
  error: string;
  trace?: WorkflowAgentTraceStep[];
  usage?: TaskRunUsage;
}

/** `queued` or `running` to `failed`, and the task back to its previous status while it is still `in_progress`. */
export async function failTaskRun({
  workspaceId,
  taskRunId,
  ...failure
}: FailTaskRunInput): Promise<boolean> {
  const moved = await transitionAndSettle(matchesTaskRun({ workspaceId, taskRunId }), {
    to: 'failed',
    ...failure,
  });
  return moved.length > 0;
}

export const STALE_TASK_RUN_ERROR = 'The run did not finish in time.';

/**
 * Fails runs stuck `running` since `runningBefore`, and `queued` since `queuedBefore` when given.
 * Returns them so the caller can write the failure comment.
 */
export async function failStaleTaskRuns({
  queuedBefore,
  runningBefore,
}: {
  queuedBefore?: Date;
  runningBefore: Date;
}): Promise<TaskRun[]> {
  const stale = or(
    queuedBefore
      ? and(eq(taskRun.status, 'queued'), lt(taskRun.createdAt, queuedBefore))
      : undefined,
    and(
      eq(taskRun.status, 'running'),
      lt(sql`coalesce(${taskRun.startedAt}, ${taskRun.createdAt})`, runningBefore),
    ),
  );
  return transitionAndSettle(stale, { to: 'failed', error: STALE_TASK_RUN_ERROR });
}

/** The oldest runs still `queued` since `queuedBefore`, at most `limit`. */
export async function listStaleQueuedTaskRuns({
  queuedBefore,
  limit,
}: {
  queuedBefore: Date;
  limit: number;
}): Promise<TaskRun[]> {
  return db
    .select()
    .from(taskRun)
    .where(and(eq(taskRun.status, 'queued'), lt(taskRun.createdAt, queuedBefore)))
    .orderBy(taskRun.createdAt)
    .limit(limit);
}

/** Fails the given runs if they are still `queued` or `running`. Returns the ones that failed. */
export async function failTaskRunsByIds({
  taskRunIds,
  error,
}: {
  taskRunIds: string[];
  error: string;
}): Promise<TaskRun[]> {
  if (taskRunIds.length === 0) return [];
  return transitionAndSettle(inArray(taskRun.id, taskRunIds), { to: 'failed', error });
}
