import {
  FINISH_TASK_RUN_TOOL_NAME,
  finishTaskRunInputSchema,
  taskRunToolDefinitions,
} from '@repo/ai';
import { config } from '@repo/config';
import type {
  AgentVersionConfig,
  TaskRun,
  TaskRunOutcome,
  TaskRunUsage,
  TaskRunWithContext,
} from '@repo/database';
import {
  createTaskComment,
  failTaskRun,
  getTaskAttachmentsByTaskId,
  getTaskRunById,
  getTaskRunWithContext,
  listAgentVersionsByIds,
  listRecentFinishedTaskRuns,
  listTaskCommentsByTaskId,
  saveTaskRunProgress,
  startTaskRun,
  succeedTaskRun,
} from '@repo/database';
import { logger } from '@repo/logger';
import type { WorkflowAgentTraceStep } from '@repo/workflow';
import { InsufficientCreditsError, ModelNotChargeableError } from '../agents/credit-gate';
import type { UnattendedAgentProgress, UnattendedAgentResult } from '../agents/unattended-agent';
import { runAgentUnattended } from '../agents/unattended-agent';
import { PermanentTaskRunError, TaskRunFailed, TaskRunStoppedError } from './task-run-errors';
import {
  assertApprovedConfigIsRunnable,
  assertRunMayTakeAnotherStep,
  assertStarterHasWorkspaceAccess,
  listToolCalls,
  listWriteToolNames,
} from './task-run-guards';
import type { PreviousRunForPrompt } from './task-run-prompt';
import { buildTaskRunPrompt, summarizeActions } from './task-run-prompt';

const MICRO_CREDITS_PER_CREDIT = 1_000_000;
const STALE_MESSAGE = 'The run did not finish in time.';
const DELETED_AGENT_MESSAGE = 'The agent was deleted.';
const UNEXPECTED_FAILURE_MESSAGE = 'The run failed unexpectedly.';

export interface TaskRunAttempt {
  taskRunId: string;
  /** 1 for the first try. */
  attempt: number;
  isFinalAttempt: boolean;
}

/** Nothing more to do: the run was canceled, deleted or finished elsewhere. */
export type TaskRunAttemptResult = 'done' | 'skipped';

interface FailureDescription {
  message: string;
  /** A retry may succeed, if no write tool has run yet. */
  retryable: boolean;
}

function describeFailure(error: unknown, timeLimitReached: boolean): FailureDescription {
  if (timeLimitReached) {
    return {
      message: `The run hit its time limit of ${config.taskRunTimeLimitMinutes} minutes.`,
      retryable: false,
    };
  }
  if (error instanceof PermanentTaskRunError || error instanceof TaskRunStoppedError) {
    return { message: error.message, retryable: false };
  }
  if (error instanceof InsufficientCreditsError) {
    return { message: 'The workspace has no credits left.', retryable: false };
  }
  if (error instanceof ModelNotChargeableError) {
    return {
      message: "The agent's model cannot be charged. Ask an admin to fix it.",
      retryable: false,
    };
  }
  return { message: UNEXPECTED_FAILURE_MESSAGE, retryable: true };
}

function toUsage(progress: UnattendedAgentProgress | null): TaskRunUsage {
  return {
    inputTokens: progress?.usage.inputTokens ?? 0,
    outputTokens: progress?.usage.outputTokens ?? 0,
    credits: Number(progress?.usage.microCredits ?? 0n) / MICRO_CREDITS_PER_CREDIT,
  };
}

function buildFailureComment({
  message,
  trace,
  writeToolNames,
}: {
  message: string;
  trace: readonly WorkflowAgentTraceStep[];
  writeToolNames: ReadonlySet<string>;
}): string {
  const actions = summarizeActions(
    listToolCalls(trace)
      .filter((call) => writeToolNames.has(call.toolName))
      .map((call) => call.toolName),
  );
  const actionsText =
    actions.length > 0
      ? `Actions already taken:\n${actions.map((action) => `- ${action}`).join('\n')}`
      : 'The agent changed nothing before it stopped.';
  return `The run failed: ${message}\n\n${actionsText}`;
}

/** The write tools of an approved version, plus the run's own tools. */
function listWriteToolNamesOfRun({
  run,
  versionConfig,
}: {
  run: Pick<TaskRun, 'id' | 'taskId' | 'workspaceId'>;
  versionConfig: AgentVersionConfig;
}): Set<string> {
  // Only tool names are read from the definitions, so an agent that was deleted since needs no id.
  const agentId = '';
  return listWriteToolNames({
    versionConfig,
    agentId,
    workspaceId: run.workspaceId,
    runToolDefinitions: taskRunToolDefinitions({ agentId, taskId: run.taskId, taskRunId: run.id }),
  });
}

/**
 * Tells the user on each task that the sweeper failed its run, and which actions it took. The
 * versions of all runs load in one query. A run without a version row lists no actions.
 */
export async function commentOnStaleTaskRuns(staleRuns: TaskRun[]): Promise<void> {
  const versions = await listAgentVersionsByIds({
    versionIds: [...new Set(staleRuns.map((run) => run.agentVersionId))],
  });
  const versionById = new Map(versions.map((version) => [version.id, version]));

  for (const run of staleRuns) {
    const version = versionById.get(run.agentVersionId);
    const writeToolNames = version
      ? listWriteToolNamesOfRun({ run, versionConfig: version.config })
      : new Set<string>();
    await postAgentComment({
      run,
      body: buildFailureComment({
        message: run.error ?? STALE_MESSAGE,
        trace: run.trace,
        writeToolNames,
      }),
    });
  }
}

async function postAgentComment({
  run,
  body,
}: {
  run: Pick<TaskRun, 'id' | 'workspaceId' | 'taskId' | 'agentId'>;
  body: string;
}): Promise<void> {
  if (!run.agentId) {
    logger.warn(`Task run ${run.id} has no agent, skipping its comment`);
    return;
  }
  try {
    const result = await createTaskComment({
      workspaceId: run.workspaceId,
      taskId: run.taskId,
      author: { kind: 'agent', agentId: run.agentId },
      body,
      taskRunId: run.id,
    });
    if (result.status !== 'created') {
      logger.warn(`Task run ${run.id} comment not written: ${result.status}`);
    }
  } catch (error) {
    logger.error(`Failed to write the comment of task run ${run.id}:`, error);
  }
}

/** Fails the run and tells the user on the task. Does nothing when the run already ended. */
export async function failTaskRunWithComment({
  run,
  message,
  trace,
  usage,
  writeToolNames,
}: {
  run: TaskRun;
  message: string;
  trace?: WorkflowAgentTraceStep[];
  usage?: TaskRunUsage;
  writeToolNames: ReadonlySet<string>;
}): Promise<void> {
  const failed = await failTaskRun({
    workspaceId: run.workspaceId,
    taskRunId: run.id,
    error: message,
    trace,
    usage,
  });
  if (!failed) return;
  await postAgentComment({
    run,
    body: buildFailureComment({ message, trace: trace ?? run.trace, writeToolNames }),
  });
}

async function loadPreviousRuns(run: TaskRun): Promise<PreviousRunForPrompt[]> {
  const previousRuns = await listRecentFinishedTaskRuns({
    workspaceId: run.workspaceId,
    taskId: run.taskId,
  });
  if (previousRuns.length === 0) return [];

  const comments = await listTaskCommentsByTaskId({
    workspaceId: run.workspaceId,
    taskId: run.taskId,
  });
  const lastCommentByRunId = new Map<string, string>();
  for (const comment of comments) {
    if (comment.taskRunId) lastCommentByRunId.set(comment.taskRunId, comment.body);
  }
  return previousRuns.map((previous) => ({
    run: previous,
    summary: lastCommentByRunId.get(previous.id) ?? null,
  }));
}

interface FinishedWork {
  outcome: TaskRunOutcome;
  summary: string;
}

/** What the agent said in `finishTaskRun`, or its closing text when it never called it. */
function readFinishedWork(result: UnattendedAgentResult): FinishedWork {
  const finishCall = listToolCalls(result.trace).find(
    (call) => call.toolName === FINISH_TASK_RUN_TOOL_NAME,
  );
  const parsed = finishTaskRunInputSchema.safeParse(finishCall?.input);
  if (parsed.success) return parsed.data;

  const text = result.text.trim();
  return { outcome: 'completed', summary: text || 'The agent finished without a summary.' };
}

/** Pickup: moves a queued run to running, or lets a retry of a running run continue. */
async function claimRun({ run, attempt }: { run: TaskRun; attempt: number }): Promise<boolean> {
  if (run.status === 'queued') {
    return startTaskRun({ workspaceId: run.workspaceId, taskRunId: run.id, attempt });
  }
  if (run.status === 'running' && attempt > 1) {
    await saveTaskRunProgress({ workspaceId: run.workspaceId, taskRunId: run.id, attempt });
    return true;
  }
  return false;
}

async function runAgent({
  run,
  agentId,
  userId,
  attempt,
  onProgress,
  writeToolNames,
  timeLimit,
}: {
  run: TaskRunWithContext;
  agentId: string;
  userId: string;
  attempt: number;
  onProgress: (progress: UnattendedAgentProgress) => void;
  writeToolNames: ReadonlySet<string>;
  timeLimit: AbortSignal;
}): Promise<UnattendedAgentResult> {
  const [attachments, previousRuns] = await Promise.all([
    getTaskAttachmentsByTaskId({ taskId: run.taskId }),
    loadPreviousRuns(run),
  ]);
  const prompt = buildTaskRunPrompt({
    task: run.task,
    attachments,
    previousRuns,
    writeToolNames,
    now: new Date(),
  });

  return runAgentUnattended({
    agentId,
    workspaceId: run.workspaceId,
    userId,
    config: run.agentVersion.config,
    prompt,
    charge: {
      feature: 'task',
      refType: 'taskRun',
      refId: run.id,
      idempotencyKey: `task:${run.id}:${attempt}`,
    },
    maxSteps: config.taskRunMaxSteps,
    abortSignal: timeLimit,
    stopAfterToolName: FINISH_TASK_RUN_TOOL_NAME,
    extraToolDefinitions: taskRunToolDefinitions({
      agentId,
      taskId: run.taskId,
      taskRunId: run.id,
    }),
    writeToolNames,
    refuseApprovalTools: true,
    inTaskRun: true,
    logLabel: `task run ${run.id}`,
    beforeStep: (progress) => assertRunMayTakeAnotherStep({ run, progress }),
    onStep: async (progress) => {
      onProgress(progress);
      await saveTaskRunProgress({
        workspaceId: run.workspaceId,
        taskRunId: run.id,
        trace: progress.trace,
        usage: toUsage(progress),
        firstWriteAt: progress.stepWroteData ? new Date() : undefined,
      });
    },
  });
}

async function finishRun({
  run,
  result,
  progress,
}: {
  run: TaskRun;
  result: UnattendedAgentResult;
  progress: UnattendedAgentProgress | null;
}): Promise<void> {
  const work = readFinishedWork(result);
  await postAgentComment({ run, body: work.summary });
  await succeedTaskRun({
    workspaceId: run.workspaceId,
    taskRunId: run.id,
    outcome: work.outcome,
    trace: result.trace,
    usage: toUsage(progress),
  });
}

/**
 * One BullMQ attempt of a task run. Returns when the run ended or has nothing left to do. Throws
 * the original error when the job should be retried, or `TaskRunFailed` when the run failed.
 */
export async function executeTaskRunAttempt({
  taskRunId,
  attempt,
  isFinalAttempt,
}: TaskRunAttempt): Promise<TaskRunAttemptResult> {
  const run = await getTaskRunWithContext({ taskRunId });
  if (!run) {
    logger.info(`Task run ${taskRunId} is gone, nothing to do`);
    return 'skipped';
  }

  const { agentId } = run;
  if (!agentId) {
    await failTaskRun({
      workspaceId: run.workspaceId,
      taskRunId: run.id,
      error: DELETED_AGENT_MESSAGE,
    });
    throw new TaskRunFailed(DELETED_AGENT_MESSAGE);
  }

  const writeToolNames = listWriteToolNamesOfRun({
    run,
    versionConfig: run.agentVersion.config,
  });

  if (!config.taskRunsEnabled) {
    await failTaskRunWithComment({ run, message: 'Task runs are disabled.', writeToolNames });
    return 'done';
  }

  if (!(await claimRun({ run, attempt }))) {
    logger.info(`Task run ${run.id} is ${run.status}, skipping attempt ${attempt}`);
    return 'skipped';
  }

  const timeLimit = AbortSignal.timeout(config.taskRunTimeLimitMinutes * 60_000);
  let latestProgress: UnattendedAgentProgress | null = null;

  try {
    const userId = await assertStarterHasWorkspaceAccess(run);
    await assertApprovedConfigIsRunnable({ versionConfig: run.agentVersion.config, userId });

    const result = await runAgent({
      run,
      agentId,
      userId,
      attempt,
      onProgress: (progress) => {
        latestProgress = progress;
      },
      writeToolNames,
      timeLimit,
    });

    if (result.hitStepLimit && !listToolCalls(result.trace).some(isFinishCall)) {
      throw new PermanentTaskRunError(
        `The run hit its step limit of ${config.taskRunMaxSteps} steps.`,
      );
    }

    await finishRun({ run, result, progress: latestProgress });
    return 'done';
  } catch (error) {
    if (error instanceof TaskRunStoppedError && error.reason === 'canceled') {
      return 'skipped';
    }
    return handleAttemptFailure({
      run,
      error,
      progress: latestProgress,
      isFinalAttempt,
      timeLimitReached: timeLimit.aborted,
      writeToolNames,
    });
  }
}

function isFinishCall(call: { toolName: string }): boolean {
  return call.toolName === FINISH_TASK_RUN_TOOL_NAME;
}

/** The attempt failed: ask for a retry when that is safe, otherwise fail the run. */
async function handleAttemptFailure({
  run,
  error,
  progress,
  isFinalAttempt,
  timeLimitReached,
  writeToolNames,
}: {
  run: TaskRun;
  error: unknown;
  progress: UnattendedAgentProgress | null;
  isFinalAttempt: boolean;
  timeLimitReached: boolean;
  writeToolNames: ReadonlySet<string>;
}): Promise<TaskRunAttemptResult> {
  const failure = describeFailure(error, timeLimitReached);
  if (failure.message === UNEXPECTED_FAILURE_MESSAGE) {
    logger.error(`Task run ${run.id} failed unexpectedly:`, error);
  }

  const current = await getTaskRunById({ workspaceId: run.workspaceId, taskRunId: run.id });
  if (current?.status !== 'running') {
    return 'skipped';
  }

  const safeToRetry = failure.retryable && current.firstWriteAt === null && !isFinalAttempt;
  if (safeToRetry) {
    throw error;
  }

  await failTaskRunWithComment({
    run: current,
    message: failure.message,
    trace: progress?.trace ?? current.trace,
    usage: progress ? toUsage(progress) : current.usage,
    writeToolNames,
  });
  throw new TaskRunFailed(failure.message);
}
