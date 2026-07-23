import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Agent } from '../schema';
import { agent } from '../schema';
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

// Clears `isDefault` on every other agent owned by `userId` in `workspaceId`,
// so at most one default agent can exist per user per workspace. Must run in
// the same transaction as the write that sets the new default, otherwise a
// race can leave two defaults.
async function clearOtherDefaultAgentsInScope(
  tx: AgentTransaction,
  {
    userId,
    workspaceId,
    exceptAgentId,
  }: { userId: string; workspaceId: string; exceptAgentId?: string },
): Promise<void> {
  await tx
    .update(agent)
    .set({ isDefault: false })
    .where(
      and(
        eq(agent.userId, userId),
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

  // Every agent belongs to a user in practice; asserting it here (rather
  // than trusting the wider, nullable ICreateAgent type) keeps the scoped
  // cleanup below from ever matching rows across users.
  if (!userId) {
    throw new Error('userId is required to create an agent');
  }

  return db.transaction(async (tx) => {
    if (isDefault) {
      await clearOtherDefaultAgentsInScope(tx, { userId, workspaceId });
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

// Get the user's personal clone of the default agent, creating it on first use
export async function getOrCreateDefaultAgentForUser({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}): Promise<Agent> {
  const existingAgent = await db.query.agent.findFirst({
    where: { userId, workspaceId, isDefault: true },
  });

  if (existingAgent) {
    return existingAgent;
  }

  const defaultAgent = await getDefaultAgent();

  return createAgent({
    userId,
    aiModelId: defaultAgent.aiModelId,
    workspaceId,
    isDefault: true,
    name: defaultAgent.name,
    description: defaultAgent.description,
    systemPrompt: defaultAgent.systemPrompt,
    tools: defaultAgent.tools,
    settings: defaultAgent.settings,
  });
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

// Ownership lookup for callers outside the workspace-guarded HTTP routes
// (e.g. workflow executors resolving an agent the running user referenced):
// scoped by userId instead, since there is no workspace guard in that path.
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
  userId,
  ...fields
}: { agentId: string; workspaceId: string; userId: string } & UpdateAgentFields): Promise<
  Agent | null
> {
  return db.transaction(async (tx) => {
    if (fields.isDefault) {
      await clearOtherDefaultAgentsInScope(tx, { userId, workspaceId, exceptAgentId: agentId });
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
  await db.delete(agent).where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)));
}
