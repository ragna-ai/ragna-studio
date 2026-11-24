import type { AgentToolGrant } from '@repo/ai';
import type { TaskRun } from '@repo/database';
import {
  approveAgent,
  createAgent,
  createTask,
  createTaskRun,
  getTaskRunById,
  startTaskRun,
  db,
} from '@repo/database';
import type { SeededAuthenticatedUser } from '@repo/testing';
import { seedAuthenticatedUser, seedCreditAccount, seedTokenPricedAiModel } from '@repo/testing';

export interface SeedTaskRunParams {
  toolGrants?: AgentToolGrant[];
  taskDescription?: string;
  dueDate?: Date;
  /** Starting balance in micro-credits. */
  balanceMicroCredits?: bigint;
  /** Who starts the run. Defaults to the seeded user. */
  startedByUserId?: string;
  user?: SeededAuthenticatedUser;
}

export interface SeededTaskRun {
  user: SeededAuthenticatedUser;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  taskId: string;
  runId: string;
}

export const DEFAULT_TEST_BALANCE_MICRO_CREDITS = 100_000_000n;

/** A queued run of a task assigned to an approved agent, as the API leaves it before the worker picks it up. */
export async function seedQueuedTaskRun(params: SeedTaskRunParams = {}): Promise<SeededTaskRun> {
  const user = params.user ?? (await seedAuthenticatedUser());
  const { workspaceId } = user;
  const { aiModelId } = await seedTokenPricedAiModel();
  await seedCreditAccount({
    userId: user.userId,
    balanceMicroCredits: params.balanceMicroCredits ?? DEFAULT_TEST_BALANCE_MICRO_CREDITS,
  });

  const agent = await createAgent({
    userId: user.userId,
    workspaceId,
    aiModelId,
    name: 'Helper',
    description: 'Seeded for task run tests',
    systemPrompt: 'Work the task.',
    toolGrants: params.toolGrants ?? [],
  });
  const approval = await approveAgent({
    agentId: agent.id,
    workspaceId,
    userId: user.userId,
  });
  if (approval.status !== 'approved') {
    throw new Error(`Agent not approved: ${approval.status}`);
  }

  const task = await createTask({
    workspaceId,
    title: 'Write the weekly report',
    description: params.taskDescription ?? 'Summarize what happened this week.',
    dueDate: params.dueDate,
    status: 'todo',
    createdByUserId: user.userId,
    assignedAgentId: agent.id,
  });

  const created = await createTaskRun({
    workspaceId,
    taskId: task.id,
    agentId: agent.id,
    agentVersionId: approval.version.id,
    startedByUserId: params.startedByUserId ?? user.userId,
  });
  if (created.status !== 'created') {
    throw new Error(`Task run not created: ${created.status}`);
  }

  return {
    user,
    workspaceId,
    agentId: agent.id,
    agentVersionId: approval.version.id,
    taskId: task.id,
    runId: created.run.id,
  };
}

/** Creates another queued run for the task after the first one has ended. */
export async function seedFollowUpRun(seeded: SeededTaskRun): Promise<string> {
  const created = await createTaskRun({
    workspaceId: seeded.workspaceId,
    taskId: seeded.taskId,
    agentId: seeded.agentId,
    agentVersionId: seeded.agentVersionId,
    startedByUserId: seeded.user.userId,
  });
  if (created.status !== 'created') {
    throw new Error(`Follow-up run not created: ${created.status}`);
  }
  return created.run.id;
}

export async function markRunRunning(seeded: SeededTaskRun, runId = seeded.runId): Promise<void> {
  await startTaskRun({ workspaceId: seeded.workspaceId, taskRunId: runId, attempt: 1 });
}

export async function loadRun(seeded: SeededTaskRun, runId = seeded.runId): Promise<TaskRun> {
  const run = await getTaskRunById({ workspaceId: seeded.workspaceId, taskRunId: runId });
  if (!run) {
    throw new Error(`Task run ${runId} not found`);
  }
  return run;
}

export async function loadTask(taskId: string) {
  return db.query.task.findFirst({ where: { id: taskId } });
}

export async function loadCommentsOfTask(taskId: string) {
  return db.query.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });
}
