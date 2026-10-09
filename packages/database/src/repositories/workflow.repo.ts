import { getWorkflowAgentIds, type WorkflowDefinition } from '@repo/workflow';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { ForeignReferenceError } from '../errors';
import type { Workflow } from '../schema';
import { agent, member, workflow, workspace } from '../schema';
import { ORGANIZATION_OWNER_ROLE, organizationRoleMatches } from './organization.repo';

export type { Workflow, NewWorkflow } from '../schema';

async function assertAgentsInWorkspace({
  definition,
  workspaceId,
}: {
  definition: WorkflowDefinition;
  workspaceId: string;
}): Promise<void> {
  const agentIds = getWorkflowAgentIds(definition);
  if (agentIds.length === 0) {
    return;
  }

  const foundAgents = await db
    .select({ id: agent.id })
    .from(agent)
    .where(and(inArray(agent.id, agentIds), eq(agent.workspaceId, workspaceId)));

  if (foundAgents.length === agentIds.length) {
    return;
  }

  const foundIds = new Set(foundAgents.map((foundAgent) => foundAgent.id));
  throw new ForeignReferenceError({
    resource: 'agent',
    ids: agentIds.filter((agentId) => !foundIds.has(agentId)),
  });
}

export async function createWorkflow(values: {
  userId: string;
  workspaceId: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
}): Promise<Workflow> {
  await assertAgentsInWorkspace({
    definition: values.definition,
    workspaceId: values.workspaceId,
  });

  const [createdWorkflow] = await db.insert(workflow).values(values).returning();

  if (!createdWorkflow) {
    throw new Error('Failed to create workflow');
  }

  return createdWorkflow;
}

export async function updateWorkflow({
  workflowId,
  workspaceId,
  name,
  description,
  definition,
}: {
  workflowId: string;
  workspaceId: string;
  name?: string;
  description?: string;
  definition?: WorkflowDefinition;
}): Promise<Workflow | null> {
  if (definition) {
    await assertAgentsInWorkspace({ definition, workspaceId });
  }

  const [updatedWorkflow] = await db
    .update(workflow)
    .set({ name, description, definition })
    .where(and(eq(workflow.id, workflowId), eq(workflow.workspaceId, workspaceId)))
    .returning();

  return updatedWorkflow ?? null;
}

export async function getWorkflowById({
  workflowId,
  workspaceId,
}: {
  workflowId: string;
  workspaceId: string;
}): Promise<Workflow | null> {
  const workflowRecord = await db.query.workflow.findFirst({
    where: { id: workflowId, workspaceId },
  });

  return workflowRecord || null;
}

export async function getWorkflowCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(workflow, eq(workflow.workspaceId, workspaceId));
}

export async function getAllWorkflowsByWorkspaceId({
  workspaceId,
  limit,
  sort = 'desc',
  offset,
}: {
  workspaceId: string;
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
    where: { workspaceId },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
  });

  return workflows;
}

export async function deleteWorkflowById({
  workflowId,
  workspaceId,
}: {
  workflowId: string;
  workspaceId: string;
}): Promise<void> {
  await db
    .delete(workflow)
    .where(and(eq(workflow.id, workflowId), eq(workflow.workspaceId, workspaceId)));
}

export async function publishWorkflow({
  workflowId,
  workspaceId,
  scheduleCron,
  scheduleTimezone,
}: {
  workflowId: string;
  workspaceId: string;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
}): Promise<Workflow | null> {
  const existingWorkflow = await getWorkflowById({ workflowId, workspaceId });

  if (!existingWorkflow) {
    return null;
  }

  const [publishedWorkflow] = await db
    .update(workflow)
    .set({
      publishedDefinition: existingWorkflow.definition,
      scheduleCron: scheduleCron ?? null,
      scheduleTimezone: scheduleTimezone ?? null,
    })
    .where(and(eq(workflow.id, workflowId), eq(workflow.workspaceId, workspaceId)))
    .returning();

  return publishedWorkflow ?? null;
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

/**
 * The user a schedule tick runs as: the workflow author, or the organization
 * owner once the author is gone. Null only when neither exists.
 */
export async function resolveScheduledRunUserId({
  workflowId,
}: {
  workflowId: string;
}): Promise<string | null> {
  const [row] = await db
    .select({ authorId: workflow.userId, ownerId: member.userId })
    .from(workflow)
    .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
    .leftJoin(
      member,
      and(
        eq(member.organizationId, workspace.organizationId),
        organizationRoleMatches(member.role, ORGANIZATION_OWNER_ROLE),
      ),
    )
    .where(eq(workflow.id, workflowId))
    .limit(1);

  return row?.authorId ?? row?.ownerId ?? null;
}
