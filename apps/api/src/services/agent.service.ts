import type { Agent, AgentSettings, AgentTools } from '@repo/database';
import {
  createAgent,
  deleteAgentById,
  getAgentByIdAndWorkspaceId,
  getAgentCountByWorkspaceId,
  getAgentsByWorkspaceId,
  getMemoryByAgentId,
  updateAgent,
  upsertMemory,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import { deleteAgentContextDocumentsForAgent } from './agent-context-document.service';

/**
 * Loads an agent scoped to its workspace, throwing 404 if it doesn't exist
 * there. Callers rely on the workspace guard having already verified
 * `workspaceId` belongs to the authenticated user:
 * no separate userId check is needed here.
 */
async function loadAgentInWorkspace({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}): Promise<Agent> {
  const { error, data: agentRecord } = await tryCatch(() =>
    getAgentByIdAndWorkspaceId({ agentId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load agent', error);
    throw new InternalServerErrorException('Failed to load agent');
  }

  if (!agentRecord) {
    throw new NotFoundException('Agent not found');
  }

  return agentRecord;
}

/**
 * [GET] /workspace/:workspaceId/agent
 * Lists a workspace's agents, paginated, plus the total count for the exact
 * same filter.
 */
export async function listAgentsForWorkspace({
  workspaceId,
  page,
  limit,
  sort,
}: {
  workspaceId: string;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}): Promise<{ agents: Awaited<ReturnType<typeof getAgentsByWorkspaceId>>; totalCount: number }> {
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    getAgentCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null || totalCount === null) {
    logger.error('Failed to count agents for workspace', countError);
    throw new InternalServerErrorException('Failed to list agents');
  }

  const { error, data: agents } = await tryCatch(() =>
    getAgentsByWorkspaceId({ workspaceId, limit, sort, offset }),
  );

  if (error !== null || !agents) {
    logger.error('Failed to list agents for workspace', error);
    throw new InternalServerErrorException('Failed to list agents');
  }

  return { agents, totalCount };
}

/**
 * [GET] /workspace/:workspaceId/agent/:agentId
 */
export async function getAgentForWorkspace({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<Agent> {
  return loadAgentInWorkspace({ agentId, workspaceId });
}

export interface CreateAgentInput {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  aiModelId: string;
  systemPrompt: string;
  context?: string | null;
  tools?: AgentTools;
  isDefault?: boolean;
  defaultDatasetId?: string | null;
  settings?: AgentSettings;
}

/**
 * [POST] /workspace/:workspaceId/agent
 * Creates an agent in the given workspace. Replaces the old upsert
 * endpoint's create half.
 */
export async function createAgentForWorkspace(input: CreateAgentInput): Promise<Agent> {
  const { error, data: createdAgent } = await tryCatch(() => createAgent(input));

  if (error !== null || !createdAgent) {
    logger.error('Failed to create agent', error);
    throw new InternalServerErrorException('Failed to create agent');
  }

  return createdAgent;
}

export interface UpdateAgentInput {
  workspaceId: string;
  agentId: string;
  userId: string;
  name?: string;
  description?: string;
  aiModelId?: string;
  systemPrompt?: string;
  context?: string | null;
  tools?: AgentTools;
  isDefault?: boolean;
  defaultDatasetId?: string | null;
  settings?: AgentSettings;
}

/**
 * [PATCH] /workspace/:workspaceId/agent/:agentId
 * Partial update. Replaces the old upsert endpoint's update half.
 */
export async function updateAgentForWorkspace(input: UpdateAgentInput): Promise<Agent> {
  const { workspaceId, agentId } = input;
  await loadAgentInWorkspace({ agentId, workspaceId });

  const { error, data: updatedAgent } = await tryCatch(() =>
    updateAgent({
      agentId,
      workspaceId,
      userId: input.userId,
      name: input.name,
      description: input.description,
      aiModelId: input.aiModelId,
      systemPrompt: input.systemPrompt,
      context: input.context,
      tools: input.tools,
      isDefault: input.isDefault,
      defaultDatasetId: input.defaultDatasetId,
      settings: input.settings,
    }),
  );

  if (error !== null) {
    logger.error('Failed to update agent', error);
    throw new InternalServerErrorException('Failed to update agent');
  }

  if (!updatedAgent) {
    throw new NotFoundException('Agent not found');
  }

  return updatedAgent;
}

/**
 * [DELETE] /workspace/:workspaceId/agent/:agentId
 * Its context documents cascade at the DB level, but their R2 objects
 * don't, so those are cleaned up here (best effort) before the row
 * disappears.
 */
export async function deleteAgentForWorkspace({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<void> {
  const agentRecord = await loadAgentInWorkspace({ agentId, workspaceId });

  await deleteAgentContextDocumentsForAgent({ agentId: agentRecord.id });
  await deleteAgentById({ agentId: agentRecord.id, workspaceId });
}

/**
 * [GET] /workspace/:workspaceId/agent/:agentId/memory
 */
export async function getAgentMemoryForWorkspace({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<string> {
  await loadAgentInWorkspace({ agentId, workspaceId });

  const { error, data: memory } = await tryCatch(() => getMemoryByAgentId({ agentId }));

  if (error !== null) {
    logger.error('Failed to get agent memory', error);
    throw new InternalServerErrorException('Failed to get agent memory');
  }

  return memory?.content ?? '';
}

/**
 * [PUT] /workspace/:workspaceId/agent/:agentId/memory
 */
export async function replaceAgentMemoryForWorkspace({
  workspaceId,
  agentId,
  content,
}: {
  workspaceId: string;
  agentId: string;
  content: string;
}): Promise<string> {
  await loadAgentInWorkspace({ agentId, workspaceId });

  const { error, data: memory } = await tryCatch(() => upsertMemory({ agentId, content }));

  if (error !== null || !memory) {
    logger.error('Failed to update agent memory', error);
    throw new InternalServerErrorException('Failed to update agent memory');
  }

  return memory.content;
}
