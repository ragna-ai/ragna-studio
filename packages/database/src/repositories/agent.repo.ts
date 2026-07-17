import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Agent } from '../schema';
import { agent } from '../schema';
import type { ICreateAgent, IUpdateAgent } from '../zod';
import { getDefaultAgent } from './agent-template.repo';

export type { Agent, AgentSettings } from '../schema';

type AgentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Clears `isDefault` on every other agent in the same scope (the agent's own
// workspaceId, where `null` is its own "unassigned" scope), so at most one
// default agent can exist per scope. Must run in the same transaction as the
// write that sets the new default, otherwise a race can leave two defaults.
async function clearOtherDefaultAgentsInScope(
  tx: AgentTransaction,
  {
    userId,
    workspaceId,
    exceptAgentId,
  }: { userId: string; workspaceId?: string | null; exceptAgentId?: string },
): Promise<void> {
  await tx
    .update(agent)
    .set({ isDefault: false })
    .where(
      and(
        eq(agent.userId, userId),
        sql`${agent.workspaceId} IS NOT DISTINCT FROM ${workspaceId ?? null}`,
        exceptAgentId ? sql`${agent.id} <> ${exceptAgentId}` : undefined,
      ),
    );
}

// Edits never send `workspaceId` (docs/workspaces.md: it's stamped on create
// only, never on edit), so on the update path `workspaceId` is `undefined`
// here even though the row already belongs to a workspace. Falling back to
// the raw body value would coalesce that to the unassigned scope and clear
// the wrong agents' defaults, so the row's current workspace is looked up
// instead. The body value still wins when explicitly provided, since that's
// also what gets written to the row.
async function resolveDefaultScopeWorkspaceId(
  tx: AgentTransaction,
  {
    agentId,
    userId,
    workspaceId,
  }: { agentId?: string; userId: string; workspaceId?: string | null },
): Promise<string | null> {
  if (workspaceId !== undefined) {
    return workspaceId;
  }

  if (!agentId) {
    return null;
  }

  const existingAgent = await tx.query.agent.findFirst({
    where: { id: agentId, userId },
    columns: { workspaceId: true },
  });

  return existingAgent?.workspaceId ?? null;
}

export async function upsertAgent(values: ICreateAgent & { id?: string }): Promise<Agent> {
  const {
    id: agentId,
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
  } = values;

  // Every agent belongs to a user in practice; asserting it here (rather
  // than trusting the wider, nullable ICreateAgent type) keeps the scoped
  // cleanup below from ever matching rows across users.
  if (!userId) {
    throw new Error('userId is required to upsert an agent');
  }

  // Omit the key entirely when unset: insert keeps the column's $defaultFn
  // default, update leaves the previously stored settings untouched.
  const settingsColumn = settings !== undefined ? { settings } : {};

  return db.transaction(async (tx) => {
    if (isDefault) {
      const scopeWorkspaceId = await resolveDefaultScopeWorkspaceId(tx, {
        agentId,
        userId,
        workspaceId,
      });

      // On update (agentId set), exclude the row being written so it isn't
      // cleared right before the write below sets it back to true. On
      // insert (no agentId yet), there is no row to exclude.
      await clearOtherDefaultAgentsInScope(tx, {
        userId,
        workspaceId: scopeWorkspaceId,
        exceptAgentId: agentId,
      });
    }

    const [createdAgent] = await tx
      .insert(agent)
      .values({
        id: agentId,
        userId,
        workspaceId,
        aiModelId,
        isDefault,
        name,
        description,
        systemPrompt,
        context,
        tools,
        ...settingsColumn,
      })
      .onConflictDoUpdate({
        target: agent.id,
        set: {
          workspaceId,
          aiModelId,
          isDefault,
          name,
          description,
          systemPrompt,
          context,
          tools,
          ...settingsColumn,
        },
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
  workspaceId?: string;
}): Promise<Agent> {
  // `workspaceId` undefined means "all/unassigned" mode: resolve it to the
  // unassigned scope instead of letting Drizzle drop the filter and match
  // any default agent, including workspace-scoped ones.
  const existingAgent = await db.query.agent.findFirst({
    where: { userId, workspaceId: workspaceId ?? { isNull: true }, isDefault: true },
  });

  if (existingAgent) {
    return existingAgent;
  }

  const defaultAgent = await getDefaultAgent();

  return upsertAgent({
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

export async function getAgentCountByUserId({
  userId,
  workspaceId,
  unassigned,
}: {
  userId: string;
  workspaceId?: string;
  unassigned?: boolean;
}): Promise<number> {
  return db.$count(
    agent,
    and(
      eq(agent.userId, userId),
      unassigned
        ? isNull(agent.workspaceId)
        : workspaceId
          ? eq(agent.workspaceId, workspaceId)
          : undefined,
    ),
  );
}

export async function getAgentById({
  agentId,
  userId,
}: {
  agentId: string;
  userId: string;
}): Promise<Agent | null> {
  const agentRecord = await db.query.agent.findFirst({
    where: { id: agentId, userId: userId },
    with: {
      aiModel: true,
    },
  });

  return agentRecord || null;
}

export async function getAllAgentsByUserId({
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
    where: { userId, workspaceId: unassigned ? { isNull: true } : workspaceId },
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
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.updatedAt) : desc(t.updatedAt)),
  });

  return agents;
}

export async function updateAgent(params: IUpdateAgent): Promise<Agent> {
  const { id: agentId, ...updateData } = params;

  if (!agentId) {
    throw new Error('Agent ID is required for update');
  }

  const [updatedAgent] = await db
    .update(agent)
    .set(updateData)
    .where(eq(agent.id, agentId))
    .returning();

  if (!updatedAgent) {
    throw new Error('Failed to update agent');
  }

  return updatedAgent;
}

// DELETE an agent by ID
export async function deleteAgentById({
  agentId,
  userId,
}: {
  agentId: string;
  userId: string;
}): Promise<void> {
  await db.delete(agent).where(and(eq(agent.id, agentId), eq(agent.userId, userId)));
}
