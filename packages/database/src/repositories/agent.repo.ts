import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Agent } from '../schema';
import { agent, task } from '../schema';
import type { ICreateAgent } from '../zod';

export type { Agent, AgentReasoningEffort, AgentSettings, AgentTool, AgentTools } from '../schema';

// Every agent now lives in exactly one workspace (workspaceId is NOT NULL),
// so "scope" is always a concrete (userId, workspaceId) pair; there is no
// more "unassigned" scope to fall back to.
type UpdateAgentFields = Partial<
  Pick<
    ICreateAgent,
    | 'name'
    | 'description'
    | 'aiModelId'
    | 'systemPrompt'
    | 'context'
    | 'tools'
    | 'settings'
    | 'defaultDatasetId'
  >
>;

export async function createAgent(values: ICreateAgent): Promise<Agent> {
  const {
    userId,
    workspaceId,
    name,
    description,
    aiModelId,
    systemPrompt,
    context,
    tools,
    settings,
    defaultDatasetId,
  } = values;

  const [createdAgent] = await db
    .insert(agent)
    .values({
      userId,
      workspaceId,
      aiModelId,
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

/** Looks up an agent by id, only if it lives in the user's private workspace. */
export async function getAgentInPersonalWorkspace({
  agentId,
  userId,
}: {
  agentId: string;
  userId: string;
}): Promise<Agent | null> {
  const agentRecord = await db.query.agent.findFirst({
    where: { id: agentId, workspace: { personalUserId: userId } },
    with: {
      aiModel: true,
    },
  });

  return agentRecord ?? null;
}

export interface ResolveEmailDraftAgentParams {
  userId: string;
  overrideAgentId?: string | null;
  defaultAgentId?: string | null;
}

/**
 * Picks the agent that drafts an email reply: the override, else the stored default.
 * Candidates outside the private workspace are skipped. Returns null when neither resolves.
 */
export async function resolveEmailDraftAgent({
  userId,
  overrideAgentId,
  defaultAgentId,
}: ResolveEmailDraftAgentParams): Promise<Agent | null> {
  const candidateIds = [overrideAgentId, defaultAgentId].filter((id): id is string => !!id);
  if (candidateIds.length > 0) {
    const privateAgents = await db.query.agent.findMany({
      where: { id: { in: candidateIds }, workspace: { personalUserId: userId } },
      with: {
        aiModel: true,
      },
    });
    const preferredAgent = candidateIds
      .map((id) => privateAgents.find((privateAgent) => privateAgent.id === id))
      .find((privateAgent) => privateAgent !== undefined);
    if (preferredAgent) {
      return preferredAgent;
    }
  }

  return null;
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
  const [updatedAgent] = await db
    .update(agent)
    .set(fields)
    .where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)))
    .returning();

  return updatedAgent ?? null;
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
