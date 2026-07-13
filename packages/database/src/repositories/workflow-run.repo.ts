import type {
  WorkflowDefinition,
  WorkflowRunStatus,
  WorkflowStepStatus,
  WorkflowToolCall,
} from '@repo/workflow';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import type {
  WorkflowRun,
  WorkflowRunStep,
  WorkflowRunWithSteps,
  WorkflowRunWithWorkflow,
} from '../schema';
import { workflowRun, workflowRunStep } from '../schema';

export async function createWorkflowRun({
  workflowId,
  definition,
  input,
}: {
  workflowId: string;
  definition: WorkflowDefinition;
  input?: string;
}): Promise<WorkflowRun> {
  const [createdRun] = await db
    .insert(workflowRun)
    .values({
      workflowId,
      definition,
      input,
    })
    .returning();

  if (!createdRun) {
    throw new Error('Failed to create workflow run');
  }

  return createdRun;
}

export async function getRunById({
  runId,
  userId,
}: {
  runId: string;
  userId: string;
}): Promise<WorkflowRunWithSteps | null> {
  const runRecord = await db.query.workflowRun.findFirst({
    where: { id: runId, workflow: { userId } },
    with: {
      steps: true,
    },
  });

  return runRecord || null;
}

export async function getRunsByWorkflowId({
  workflowId,
  userId,
}: {
  workflowId: string;
  userId: string;
}): Promise<WorkflowRun[]> {
  const runs = await db.query.workflowRun.findMany({
    where: { workflowId, workflow: { userId } },
    orderBy: (t, { desc }) => desc(t.createdAt),
  });

  return runs;
}

// No ownership check: called by the worker, which only has the run id from
// the queue job. It reads the workflow row to recover the owning userId.
export async function getRunForExecution({
  runId,
}: {
  runId: string;
}): Promise<WorkflowRunWithWorkflow | null> {
  const runRecord = await db.query.workflowRun.findFirst({
    where: { id: runId },
    with: {
      workflow: true,
    },
  });

  return runRecord || null;
}

// Cheap status-only read, used by the engine to detect a mid-flight cancel
// between node executions without paying for the full run + workflow join.
export async function getRunStatus({
  runId,
}: {
  runId: string;
}): Promise<WorkflowRunStatus | null> {
  const runRecord = await db.query.workflowRun.findFirst({
    where: { id: runId },
    columns: { status: true },
  });

  return runRecord?.status ?? null;
}

export async function updateRunStatus({
  runId,
  status,
  output,
  error,
  startedAt,
  finishedAt,
}: {
  runId: string;
  status: WorkflowRunStatus;
  output?: string;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
}): Promise<WorkflowRun> {
  const [updatedRun] = await db
    .update(workflowRun)
    .set({ status, output, error, startedAt, finishedAt })
    .where(eq(workflowRun.id, runId))
    .returning();

  if (!updatedRun) {
    throw new Error('Failed to update workflow run status');
  }

  return updatedRun;
}

export async function upsertRunStep({
  runId,
  nodeId,
  status,
  input,
  output,
  toolCalls,
  error,
  startedAt,
  finishedAt,
}: {
  runId: string;
  nodeId: string;
  status: WorkflowStepStatus;
  input?: string;
  output?: string;
  toolCalls?: WorkflowToolCall[];
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
}): Promise<WorkflowRunStep> {
  const [upsertedStep] = await db
    .insert(workflowRunStep)
    .values({
      runId,
      nodeId,
      status,
      input,
      output,
      toolCalls,
      error,
      startedAt,
      finishedAt,
    })
    .onConflictDoUpdate({
      target: [workflowRunStep.runId, workflowRunStep.nodeId],
      set: {
        status,
        input,
        output,
        toolCalls,
        error,
        startedAt,
        finishedAt,
      },
    })
    .returning();

  if (!upsertedStep) {
    throw new Error('Failed to save workflow run step');
  }

  return upsertedStep;
}

export async function getStepsByRunId({ runId }: { runId: string }): Promise<WorkflowRunStep[]> {
  const steps = await db.query.workflowRunStep.findMany({
    where: { runId },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });

  return steps;
}
