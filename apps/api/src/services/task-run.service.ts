import type { TaskRun, TaskRunWithRelations, WorkspaceRole } from '@repo/database';
import {
  cancelActiveTaskRunsInWorkspace,
  cancelTaskRunById,
  countActiveTaskRuns,
  createTaskRun,
  failTaskRun,
  getAgentByIdAndWorkspaceId,
  getApprovedAgentVersion,
  getTaskRunById,
  listTaskRunsWithRelations,
  resolveCreditSpendState,
  WORKSPACE_MANAGER_ROLE,
} from '@repo/database';
import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { queue, RUN_TASK_JOB, taskRunJobSchema } from '@repo/queue';
import {
  AgentNotApprovedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  OutOfCreditsException,
  TaskHasNoAgentException,
  TaskRunActiveException,
  TaskRunLimitReachedException,
  TaskRunsDisabledException,
} from '../exceptions';
import { getTask, updateTaskForUser } from './task.service';

interface TaskRunScope {
  workspaceId: string;
  taskId: string;
}

interface TaskRunTarget extends TaskRunScope {
  taskRunId: string;
}

export interface TaskRunResponse {
  id: string;
  taskId: string;
  status: TaskRun['status'];
  outcome: TaskRun['outcome'];
  error: string | null;
  agent: TaskRunWithRelations['agent'];
  agentVersion: TaskRunWithRelations['agentVersion'] | null;
  startedBy: TaskRunWithRelations['startedByUser'];
  trace: TaskRun['trace'];
  usage: TaskRun['usage'] | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

function toTaskRunResponse(run: TaskRunWithRelations): TaskRunResponse {
  return {
    id: run.id,
    taskId: run.taskId,
    status: run.status,
    outcome: run.outcome,
    error: run.error,
    agent: run.agent,
    agentVersion: run.agentVersion,
    startedBy: run.startedByUser,
    trace: run.trace,
    usage: run.usage,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

async function loadTaskRunResponse(target: TaskRunTarget): Promise<TaskRunResponse> {
  const [run] = await listTaskRunsWithRelations(target);
  if (!run) throw new NotFoundException('Run not found');
  return toTaskRunResponse(run);
}

async function assertBalanceCoversRun(workspaceId: string): Promise<void> {
  if (!config.creditsEnabled) return;

  const spendState = await resolveCreditSpendState({ workspaceId });
  if (!spendState || spendState.balanceMicroCredits < config.taskRunMinMicroCredits) {
    throw new OutOfCreditsException('Out of credits');
  }
}

async function assertWorkspaceHasRoomForRun(workspaceId: string): Promise<void> {
  const activeRuns = await countActiveTaskRuns({ workspaceId });
  if (activeRuns >= config.taskRunMaxActivePerWorkspace) {
    throw new TaskRunLimitReachedException();
  }
}

/** The agent that will run: the requested one, which must live in the workspace, else the assigned one. */
async function resolveRunAgentId({
  workspaceId,
  requestedAgentId,
  assignedAgentId,
}: {
  workspaceId: string;
  requestedAgentId: string | undefined;
  assignedAgentId: string | undefined;
}): Promise<string> {
  if (requestedAgentId) {
    const requestedAgent = await getAgentByIdAndWorkspaceId({
      agentId: requestedAgentId,
      workspaceId,
    });
    if (!requestedAgent) throw new NotFoundException('Agent not found');
    return requestedAgentId;
  }
  if (!assignedAgentId) throw new TaskHasNoAgentException();
  return assignedAgentId;
}

/** Marks the run failed so its task is not stuck in progress with no job behind it. */
async function failRunAfterEnqueueError(target: TaskRunTarget, error: unknown): Promise<void> {
  logger.error('Failed to enqueue task run', error);
  await failTaskRun({
    workspaceId: target.workspaceId,
    taskRunId: target.taskRunId,
    error: 'The run could not be queued.',
  });
}

export interface StartTaskRunParams extends TaskRunScope {
  userId: string;
  /** Assigns this agent to the task before the run starts. */
  agentId?: string;
}

/** [POST] /workspace/:workspaceId/task/:taskId/runs */
export async function startTaskRunForUser({
  workspaceId,
  taskId,
  userId,
  agentId: requestedAgentId,
}: StartTaskRunParams): Promise<TaskRunResponse> {
  if (!config.taskRunsEnabled) throw new TaskRunsDisabledException();

  const taskRecord = await getTask({ workspaceId, taskId });
  if (taskRecord.activeRun) throw new TaskRunActiveException();

  const agentId = await resolveRunAgentId({
    workspaceId,
    requestedAgentId,
    assignedAgentId: taskRecord.assignedAgent?.id,
  });

  const approvedVersion = await getApprovedAgentVersion({ agentId, workspaceId });
  if (!approvedVersion) throw new AgentNotApprovedException();

  await assertBalanceCoversRun(workspaceId);
  await assertWorkspaceHasRoomForRun(workspaceId);

  if (taskRecord.assignedAgent?.id !== agentId) {
    await updateTaskForUser({ workspaceId, taskId, assignedAgentId: agentId });
  }

  const created = await createTaskRun({
    workspaceId,
    taskId,
    agentId,
    agentVersionId: approvedVersion.id,
    startedByUserId: userId,
  });
  if (created.status === 'task-not-found') throw new NotFoundException('Task not found');
  if (created.status === 'run-active') throw new TaskRunActiveException();

  const target = { workspaceId, taskId, taskRunId: created.run.id };
  try {
    await queue
      .taskRun()
      .add(RUN_TASK_JOB, taskRunJobSchema.parse({ taskRunId: target.taskRunId }));
  } catch (error) {
    await failRunAfterEnqueueError(target, error);
    throw error;
  }

  return loadTaskRunResponse(target);
}

/** [GET] /workspace/:workspaceId/task/:taskId/runs */
export async function listTaskRuns(scope: TaskRunScope): Promise<TaskRunResponse[]> {
  await getTask(scope);
  const runs = await listTaskRunsWithRelations(scope);
  return runs.map(toTaskRunResponse);
}

/** [POST] /workspace/:workspaceId/task/:taskId/runs/:taskRunId/cancel */
export async function cancelTaskRun(target: TaskRunTarget): Promise<TaskRunResponse> {
  const run = await getTaskRunById(target);
  if (!run || run.taskId !== target.taskId) throw new NotFoundException('Run not found');

  const canceled = await cancelTaskRunById(target);
  if (canceled.length === 0) throw new ConflictException('This run has already finished.');

  return loadTaskRunResponse(target);
}

export interface CancelAllTaskRunsResponse {
  canceledCount: number;
}

/** [POST] /workspace/:workspaceId/task-runs/cancel-all */
export async function cancelAllTaskRuns({
  workspaceId,
  workspaceRole,
}: {
  workspaceId: string;
  workspaceRole: WorkspaceRole;
}): Promise<CancelAllTaskRunsResponse> {
  if (workspaceRole !== WORKSPACE_MANAGER_ROLE) throw new ForbiddenException();

  const canceled = await cancelActiveTaskRunsInWorkspace({ workspaceId });
  return { canceledCount: canceled.length };
}
