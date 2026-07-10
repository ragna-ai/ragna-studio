import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Agent } from '../schema';
import { agent } from '../schema';
import type { ICreateAgent, IUpdateAgent } from '../zod';
import { getDefaultAgent } from './default-agent.repo';

export async function upsertAgent(values: ICreateAgent & { id?: string }): Promise<Agent> {
  const {
    id: agentId,
    userId,
    name,
    description,
    aiModelId,
    isDefault,
    systemPrompt,
    tools,
  } = values;

  const [createdAgent] = await db
    .insert(agent)
    .values({
      id: agentId,
      userId,
      aiModelId,
      isDefault,
      name,
      description,
      systemPrompt,
      tools,
    })
    .onConflictDoUpdate({
      target: agent.id,
      set: {
        aiModelId,
        name,
        description,
        systemPrompt,
        tools,
      },
    })
    .returning();

  if (!createdAgent) {
    throw new Error('Failed to create agent');
  }

  return createdAgent;
}

// Get the user's personal clone of the default agent, creating it on first use
export async function getOrCreateDefaultAgentForUser({
  userId,
}: {
  userId: string;
}): Promise<Agent> {
  const existingAgent = await db.query.agent.findFirst({
    where: { userId, isDefault: true },
  });

  if (existingAgent) {
    return existingAgent;
  }

  const defaultAgent = await getDefaultAgent();

  return upsertAgent({
    userId,
    aiModelId: defaultAgent.aiModelId,
    isDefault: true,
    name: defaultAgent.name,
    description: defaultAgent.description,
    systemPrompt: defaultAgent.systemPrompt,
    tools: defaultAgent.tools,
  });
}

export async function getAgentCountByUserId({ userId }: { userId: string }): Promise<number> {
  return db.$count(agent, eq(agent.userId, userId));
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
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}) {
  const agents = await db.query.agent.findMany({
    columns: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { userId: userId },
    with: {
      aiModel: {
        columns: {
          provider: true,
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
