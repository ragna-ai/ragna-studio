import type { WorkflowDefinition } from '@repo/workflow';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Workflow } from '../schema';
import { workflow } from '../schema';

export async function upsertWorkflow(values: {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
}): Promise<Workflow> {
  const { id: workflowId, userId, name, description, definition } = values;

  const [upsertedWorkflow] = await db
    .insert(workflow)
    .values({
      id: workflowId,
      userId,
      name,
      description,
      definition,
    })
    .onConflictDoUpdate({
      target: workflow.id,
      set: {
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

export async function getWorkflowCountByUserId({ userId }: { userId: string }): Promise<number> {
  return db.$count(workflow, eq(workflow.userId, userId));
}

export async function getAllWorkflowsByUserId({
  userId,
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
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
      createdAt: true,
      updatedAt: true,
    },
    where: { userId },
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
}: {
  workflowId: string;
  userId: string;
}): Promise<Workflow> {
  const existingWorkflow = await getWorkflowById({ workflowId, userId });

  if (!existingWorkflow) {
    throw new Error('Workflow not found');
  }

  const [publishedWorkflow] = await db
    .update(workflow)
    .set({ publishedDefinition: existingWorkflow.definition })
    .where(and(eq(workflow.id, workflowId), eq(workflow.userId, userId)))
    .returning();

  if (!publishedWorkflow) {
    throw new Error('Failed to publish workflow');
  }

  return publishedWorkflow;
}
