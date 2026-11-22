import type {
  Agent,
  AgentSettings,
  AgentTemplateListItem,
  StoredAgentToolGrant,
} from '@repo/database';
import {
  AgentLockedError,
  createAgent,
  createAgentFromTemplate,
  deleteAgentById,
  getAgentByIdAndWorkspaceId,
  getAgentCountByWorkspaceId,
  getAgentsByWorkspaceId,
  getMemoryByAgentId,
  listAgentTemplates,
  updateAgent,
  upsertMemoryWhileUnlocked,
} from '@repo/database';
import { logger } from '@repo/logger';
import { deleteMediaIfUnreferenced } from '@repo/media';
import { tryCatch } from '@repo/utils';
import {
  AgentLockedException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { throwIfForeignReference } from '../utils/foreign-reference';
import { toAgentMarkResponse } from '../utils/agent-mark';
import { deleteAgentContextDocumentsForAgent } from './agent-context-document.service';
import {
  resolveAgentLockActions,
  toAgentLockResponse,
  type AgentLockActions,
  type AgentLockResponse,
  type AgentLockViewer,
} from './agent-lock.service';
import { getOwnedImageMedia } from './media.service';

type AgentWithImageMedia = NonNullable<Awaited<ReturnType<typeof getAgentByIdAndWorkspaceId>>>;

/** The agent row as the API returns it: the lock pointer is exposed as `lock` instead. */
type AgentFields = Omit<Agent, 'lockedVersionId'>;

/** An agent as the API returns it: the row plus the public URL of its image, null without one. */
export type AgentResponse = AgentFields & { imageUrl: string | null };

/** The detail variant also carries the agent's AI model and its lock. */
export type AgentDetailResponse = Omit<
  AgentWithImageMedia,
  'imageMedia' | 'lockedVersion' | 'lockedVersionId'
> & {
  imageUrl: string | null;
  lock: AgentLockResponse | null;
  lockActions: AgentLockActions;
};

function toAgentResponse(
  agentRow: Agent,
  imageMedia: AgentWithImageMedia['imageMedia'],
): AgentResponse {
  const { lockedVersionId: _lockedVersionId, ...agentFields } = agentRow;
  return { ...agentFields, imageUrl: toAgentMarkResponse({ ...agentFields, imageMedia }).imageUrl };
}

async function toAgentDetailResponse(
  agentRecord: AgentWithImageMedia,
  { viewer, workspaceId }: { viewer: AgentLockViewer; workspaceId: string },
): Promise<AgentDetailResponse> {
  const {
    imageMedia,
    lockedVersion,
    lockedVersionId: _lockedVersionId,
    ...agentFields
  } = agentRecord;
  const lockActions = await resolveAgentLockActions({ viewer, workspaceId, lockedVersion });
  return {
    ...agentFields,
    imageUrl: toAgentMarkResponse({ ...agentFields, imageMedia }).imageUrl,
    lock: toAgentLockResponse(lockedVersion),
    lockActions,
  };
}

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
}): Promise<AgentWithImageMedia> {
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

type AgentListRow = Awaited<ReturnType<typeof getAgentsByWorkspaceId>>[number];
export type AgentListItem = Omit<AgentListRow, 'imageMedia' | 'lockedVersion'> & {
  imageUrl: string | null;
  lock: AgentLockResponse | null;
};

export interface AgentListResponse {
  agents: AgentListItem[];
  totalCount: number;
}

function toAgentListItem(agentRow: AgentListRow): AgentListItem {
  const { imageMedia, lockedVersion, ...agentFields } = agentRow;
  return {
    ...agentFields,
    imageUrl: toAgentMarkResponse({ ...agentFields, imageMedia }).imageUrl,
    lock: toAgentLockResponse(lockedVersion),
  };
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
  searchQuery,
}: {
  workspaceId: string;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
  searchQuery?: string;
}): Promise<AgentListResponse> {
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    getAgentCountByWorkspaceId({ workspaceId, searchQuery }),
  );

  if (countError !== null || totalCount === null) {
    logger.error('Failed to count agents for workspace', countError);
    throw new InternalServerErrorException('Failed to list agents');
  }

  const { error, data: agents } = await tryCatch(() =>
    getAgentsByWorkspaceId({ workspaceId, limit, sort, offset, searchQuery }),
  );

  if (error !== null || !agents) {
    logger.error('Failed to list agents for workspace', error);
    throw new InternalServerErrorException('Failed to list agents');
  }

  return { agents: agents.map(toAgentListItem), totalCount };
}

/**
 * [GET] /workspace/:workspaceId/agent/:agentId
 */
export async function getAgentForWorkspace({
  workspaceId,
  agentId,
  viewer,
}: {
  workspaceId: string;
  agentId: string;
  viewer: AgentLockViewer;
}): Promise<AgentDetailResponse> {
  const agentRecord = await loadAgentInWorkspace({ agentId, workspaceId });
  return toAgentDetailResponse(agentRecord, { viewer, workspaceId });
}

export interface CreateAgentInput {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  aiModelId: string;
  systemPrompt: string;
  context?: string | null;
  toolGrants?: StoredAgentToolGrant[];
  defaultDatasetId?: string | null;
  icon?: string | null;
  tone?: string | null;
  imageMediaId?: string | null;
  settings?: AgentSettings;
}

/**
 * [POST] /workspace/:workspaceId/agent
 * Creates an agent in the given workspace. Replaces the old upsert
 * endpoint's create half.
 */
export async function createAgentForWorkspace(input: CreateAgentInput): Promise<AgentResponse> {
  const { userId, workspaceId, imageMediaId } = input;
  const imageMedia = imageMediaId
    ? await getOwnedImageMedia({ userId, workspaceId, mediaId: imageMediaId })
    : null;

  const { error, data: createdAgent } = await tryCatch(() => createAgent(input));

  if (error !== null) {
    throwIfForeignReference(error);
  }

  if (error !== null || !createdAgent) {
    logger.error('Failed to create agent', error);
    throw new InternalServerErrorException('Failed to create agent');
  }

  return toAgentResponse(createdAgent, imageMedia);
}

export interface CreateAgentFromTemplateInput {
  workspaceId: string;
  userId: string;
  templateId: string;
}

/**
 * [POST] /workspace/:workspaceId/agent/from-template
 * Copies an agent template into a new agent of the workspace. 404 for an unknown template.
 */
export async function createAgentFromTemplateForWorkspace(
  input: CreateAgentFromTemplateInput,
): Promise<AgentResponse> {
  const { error, data: createdAgent } = await tryCatch(() => createAgentFromTemplate(input));

  if (error !== null) {
    logger.error('Failed to create agent from template', error);
    throw new InternalServerErrorException('Failed to create agent');
  }

  if (!createdAgent) {
    throw new NotFoundException('Agent template not found');
  }

  return toAgentResponse(createdAgent, null);
}

export interface AgentTemplateListResponse {
  templates: AgentTemplateListItem[];
}

/**
 * [GET] /agent-template
 * Lists every agent template with its model's display name.
 */
export async function listAgentTemplatesForUser(): Promise<AgentTemplateListResponse> {
  const { error, data: templates } = await tryCatch(() => listAgentTemplates());

  if (error !== null || !templates) {
    logger.error('Failed to list agent templates', error);
    throw new InternalServerErrorException('Failed to list agent templates');
  }

  return { templates };
}

export interface UpdateAgentInput {
  userId: string;
  workspaceId: string;
  agentId: string;
  name?: string;
  description?: string;
  aiModelId?: string;
  systemPrompt?: string;
  context?: string | null;
  toolGrants?: StoredAgentToolGrant[];
  defaultDatasetId?: string | null;
  icon?: string | null;
  tone?: string | null;
  imageMediaId?: string | null;
  settings?: AgentSettings;
}

/**
 * [PATCH] /workspace/:workspaceId/agent/:agentId
 * Partial update. Replaces the old upsert endpoint's update half.
 */
export async function updateAgentForWorkspace(input: UpdateAgentInput): Promise<AgentResponse> {
  const { userId, workspaceId, agentId } = input;
  const previousAgent = await loadAgentInWorkspace({ agentId, workspaceId });

  if (input.imageMediaId) {
    await getOwnedImageMedia({ userId, workspaceId, mediaId: input.imageMediaId });
  }

  const { error, data: updatedAgent } = await tryCatch(() =>
    updateAgent({
      agentId,
      workspaceId,
      name: input.name,
      description: input.description,
      aiModelId: input.aiModelId,
      systemPrompt: input.systemPrompt,
      context: input.context,
      toolGrants: input.toolGrants,
      defaultDatasetId: input.defaultDatasetId,
      icon: input.icon,
      tone: input.tone,
      imageMediaId: input.imageMediaId,
      settings: input.settings,
    }),
  );

  if (error instanceof AgentLockedError) {
    throw new AgentLockedException();
  }

  if (error !== null) {
    throwIfForeignReference(error);
    logger.error('Failed to update agent', error);
    throw new InternalServerErrorException('Failed to update agent');
  }

  if (!updatedAgent) {
    throw new NotFoundException('Agent not found');
  }

  const replacedImageMediaId = previousAgent.imageMediaId;
  if (input.imageMediaId !== undefined && replacedImageMediaId) {
    await deleteMediaIfUnreferenced({ mediaIds: [replacedImageMediaId] });
  }

  const { imageMedia } = await loadAgentInWorkspace({ agentId, workspaceId });
  return toAgentResponse(updatedAgent, imageMedia);
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
  if (agentRecord.lockedVersionId) {
    throw new AgentLockedException();
  }

  await deleteAgentContextDocumentsForAgent({ agentId: agentRecord.id });

  const { error } = await tryCatch(() => deleteAgentById({ agentId: agentRecord.id, workspaceId }));
  if (error instanceof AgentLockedError) {
    throw new AgentLockedException();
  }
  if (error !== null) {
    logger.error('Failed to delete agent', error);
    throw new InternalServerErrorException('Failed to delete agent');
  }

  if (agentRecord.imageMediaId) {
    await deleteMediaIfUnreferenced({ mediaIds: [agentRecord.imageMediaId] });
  }
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

  const { error, data: memory } = await tryCatch(() =>
    upsertMemoryWhileUnlocked({ agentId, content }),
  );

  if (error instanceof AgentLockedError) throw new AgentLockedException();
  if (error !== null || !memory) {
    logger.error('Failed to update agent memory', error);
    throw new InternalServerErrorException('Failed to update agent memory');
  }

  return memory.content;
}
