import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Agent } from '../schema';
import { agent, task } from '../schema';
import type { ICreateAgent } from '../zod';
import { getDefaultAgent } from './agent-template.repo';

export type { Agent, AgentReasoningEffort, AgentSettings, AgentTool, AgentTools } from '../schema';

type AgentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Every agent now lives in exactly one workspace (workspaceId is NOT NULL),
// so "scope" is always a concrete (userId, workspaceId) pair; there is no
// more "unassigned" scope to fall back to.
type UpdateAgentFields = Partial<
  Pick<
    ICreateAgent,
    | 'name'
    | 'description'
    | 'aiModelId'
    | 'isDefault'
    | 'systemPrompt'
    | 'context'
    | 'tools'
    | 'settings'
    | 'defaultDatasetId'
  >
>;

// Clears `isDefault` on every other agent in `workspaceId`, so at most one
// default agent exists per workspace. Must run in the same transaction as the
// write that sets the new default, otherwise a race can leave two defaults.
async function clearOtherDefaultAgentsInWorkspace(
  tx: AgentTransaction,
  { workspaceId, exceptAgentId }: { workspaceId: string; exceptAgentId?: string },
): Promise<void> {
  await tx
    .update(agent)
    .set({ isDefault: false })
    .where(
      and(
        eq(agent.workspaceId, workspaceId),
        exceptAgentId ? sql`${agent.id} <> ${exceptAgentId}` : undefined,
      ),
    );
}

export async function createAgent(values: ICreateAgent): Promise<Agent> {
  const {
    userId,
    workspaceId,
    name,
    description,
    aiModelId,
    isDefault,
    systemPrompt,
    context,
    tools,
    settings,
    defaultDatasetId,
  } = values;

  return db.transaction(async (tx) => {
    if (isDefault) {
      await clearOtherDefaultAgentsInWorkspace(tx, { workspaceId });
    }

    const [createdAgent] = await tx
      .insert(agent)
      .values({
        userId,
        workspaceId,
        aiModelId,
        isDefault,
        name,
        description,
        systemPrompt,
        context,
        tools,
        defaultDatasetId,
        // Omit when unset so the column's $defaultFn default applies.
        ...(settings !== undefined ? { settings } : {}),
      })
      .returning();

    if (!createdAgent) {
      throw new Error('Failed to create agent');
    }

    return createdAgent;
  });
}

// Get the workspace's shared clone of the default agent, creating it on first use.
// `userId` is only the author of a newly created clone.
export async function getOrCreateDefaultAgentForWorkspace({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}): Promise<Agent> {
  const findExisting = () => db.query.agent.findFirst({ where: { workspaceId, isDefault: true } });

  const existingAgent = await findExisting();
  if (existingAgent) {
    return existingAgent;
  }

  const defaultAgent = await getDefaultAgent();

  // Not createAgent: its default-clearing would demote a default a colleague
  // just committed. On conflict the colleague's default wins and is re-read.
  const [createdAgent] = await db
    .insert(agent)
    .values({
      userId,
      workspaceId,
      aiModelId: defaultAgent.aiModelId,
      isDefault: true,
      name: defaultAgent.name,
      description: defaultAgent.description,
      systemPrompt: defaultAgent.systemPrompt,
      tools: defaultAgent.tools,
      settings: defaultAgent.settings,
    })
    .onConflictDoNothing({ target: agent.workspaceId, where: sql`${agent.isDefault}` })
    .returning();
  if (createdAgent) {
    return createdAgent;
  }

  const concurrentAgent = await findExisting();
  if (!concurrentAgent) {
    throw new Error('Failed to create default agent');
  }
  return concurrentAgent;
}

export async function getAgentCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(agent, eq(agent.workspaceId, workspaceId));
}

// Plain lookup by id, scoped by workspace only: the workspace guard already
// proved the caller owns `workspaceId`, so access control ends there.
export async function getAgentByIdAndWorkspaceId({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}): Promise<Agent | null> {
  const agentRecord = await db.query.agent.findFirst({
    where: { id: agentId, workspaceId },
    with: {
      aiModel: true,
    },
  });

  return agentRecord ?? null;
}

// Per-user lookup for email, which has no workspace scope by design.
export async function getAgentById({
  agentId,
  userId,
}: {
  agentId: string;
  userId: string;
}): Promise<Agent | null> {
  const agentRecord = await db.query.agent.findFirst({
    where: { id: agentId, userId },
    with: {
      aiModel: true,
    },
  });

  return agentRecord ?? null;
}

export async function getAgentsByWorkspaceId({
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
  const agents = await db.query.agent.findMany({
    columns: {
      id: true,
      name: true,
      description: true,
      tools: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { workspaceId },
    with: {
      aiModel: {
        columns: {
          provider: true,
          model: true,
          displayName: true,
        },
      },
    },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
  });

  return agents;
}

// `agentId`/`workspaceId` are always required in the WHERE clause, even
// though the caller already resolved the agent once via
// `getAgentByIdAndWorkspaceId()` to check ownership, so a mismatched id can
// never update a row outside the caller's workspace. Fields left out of
// `fields` are left untouched (partial update).
export async function updateAgent({
  agentId,
  workspaceId,
  ...fields
}: {
  agentId: string;
  workspaceId: string;
} & UpdateAgentFields): Promise<Agent | null> {
  return db.transaction(async (tx) => {
    if (fields.isDefault) {
      await clearOtherDefaultAgentsInWorkspace(tx, { workspaceId, exceptAgentId: agentId });
    }

    const [updatedAgent] = await tx
      .update(agent)
      .set(fields)
      .where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)))
      .returning();

    return updatedAgent ?? null;
  });
}

// DELETE an agent by ID, scoped to its workspace.
export async function deleteAgentById({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(task)
      .set({ assignedAgentId: null })
      .where(and(eq(task.assignedAgentId, agentId), eq(task.workspaceId, workspaceId)));
    await tx.delete(agent).where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)));
  });
}
