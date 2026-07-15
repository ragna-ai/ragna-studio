import type { WorkflowDefinition } from '@repo/workflow';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import type { Workflow } from '../schema';
import { workflow } from '../schema';

export async function upsertWorkflow(values: {
  id?: string;
  userId: string;
  workspaceId?: string | null;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
}): Promise<Workflow> {
  const { id: workflowId, userId, workspaceId, name, description, definition } = values;

  const [upsertedWorkflow] = await db
    .insert(workflow)
    .values({
      id: workflowId,
      userId,
      workspaceId,
      name,
      description,
      definition,
    })
    .onConflictDoUpdate({
      target: workflow.id,
      set: {
        workspaceId,
        name,
        description,
        definition,
      },
    })
    .returning();

  if (!upsertedWorkflow) {
    throw new Error('Failed to save workflow');
  }

  return upsertedWorkflow;
}

export async function getWorkflowById({
  workflowId,
  userId,
}: {
  workflowId: string;
  userId: string;
}): Promise<Workflow | null> {
  const workflowRecord = await db.query.workflow.findFirst({
    where: { id: workflowId, userId },
  });

  return workflowRecord || null;
}

export async function getWorkflowCountByUserId({
  userId,
  workspaceId,
  unassigned,
}: {
  userId: string;
  workspaceId?: string;
  unassigned?: boolean;
}): Promise<number> {
  return db.$count(
    workflow,
    and(
      eq(workflow.userId, userId),
      unassigned
        ? isNull(workflow.workspaceId)
        : workspaceId
          ? eq(workflow.workspaceId, workspaceId)
          : undefined,
    ),
  );
}

export async function getAllWorkflowsByUserId({
  userId,
  workspaceId,
  unassigned,
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
  workspaceId?: string;
  unassigned?: boolean;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}) {
  const workflows = await db.query.workflow.findMany({
    columns: {
      id: true,
      name: true,
      description: true,
      publishedDefinition: true,
      scheduleCron: true,
      scheduleTimezone: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { userId, workspaceId: unassigned ? { isNull: true } : workspaceId },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.updatedAt) : desc(t.updatedAt)),
  });

  return workflows;
}

export async function deleteWorkflowById({
  workflowId,
  userId,
}: {
  workflowId: string;
  userId: string;
}): Promise<void> {
  await db.delete(workflow).where(and(eq(workflow.id, workflowId), eq(workflow.userId, userId)));
}

export async function publishWorkflow({
  workflowId,
  userId,
  scheduleCron,
  scheduleTimezone,
}: {
  workflowId: string;
  userId: string;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
}): Promise<Workflow> {
  const existingWorkflow = await getWorkflowById({ workflowId, userId });

  if (!existingWorkflow) {
    throw new Error('Workflow not found');
  }

  const [publishedWorkflow] = await db
    .update(workflow)
    .set({
      publishedDefinition: existingWorkflow.definition,
      scheduleCron: scheduleCron ?? null,
      scheduleTimezone: scheduleTimezone ?? null,
    })
    .where(and(eq(workflow.id, workflowId), eq(workflow.userId, userId)))
    .returning();

  if (!publishedWorkflow) {
    throw new Error('Failed to publish workflow');
  }

  return publishedWorkflow;
}

export type ScheduledWorkflow = {
  id: string;
  scheduleCron: string;
  scheduleTimezone: string | null;
};

// Used by worker startup reconciliation to upsert a BullMQ job scheduler for
// every schedule the DB knows about.
export async function getScheduledWorkflows(): Promise<ScheduledWorkflow[]> {
  const workflows = await db.query.workflow.findMany({
    columns: {
      id: true,
      scheduleCron: true,
      scheduleTimezone: true,
    },
    where: { scheduleCron: { isNotNull: true } },
  });

  // The `isNotNull` filter guarantees `scheduleCron` at runtime, but drizzle's
  // column type stays nullable, so narrow it explicitly instead of casting.
  return workflows.flatMap((workflowRow) =>
    workflowRow.scheduleCron
      ? [
          {
            id: workflowRow.id,
            scheduleCron: workflowRow.scheduleCron,
            scheduleTimezone: workflowRow.scheduleTimezone,
          },
        ]
      : [],
  );
}

// No ownership check: called by the schedule tick processor, which only has
// the workflow id from the queue job's scheduler id.
export async function getWorkflowForScheduledRun({
  workflowId,
}: {
  workflowId: string;
}): Promise<Workflow | null> {
  const workflowRecord = await db.query.workflow.findFirst({
    where: { id: workflowId },
  });

  return workflowRecord || null;
}
