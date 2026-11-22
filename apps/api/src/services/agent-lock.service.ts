import type { AgentUsage, WorkspaceRole } from '@repo/database';
import {
  approveAgent,
  getAgentByIdAndWorkspaceId,
  getAgentUsage,
  getWorkspaceUserRoles,
  hasOrganizationRole,
  listAgentVersions,
  lockAgent,
  ORGANIZATION_ADMIN_ROLE,
  ORGANIZATION_OWNER_ROLE,
  revokeAgentApproval,
  unlockAgent,
  WORKSPACE_MANAGER_ROLE,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import {
  AgentAlreadyApprovedException,
  AgentAlreadyLockedException,
  AgentNotApprovedException,
  AgentNotLockedException,
  ForbiddenException,
  InternalServerErrorException,
  KnowledgeFilesNotReadyException,
  NotFoundException,
} from '../exceptions';

/** Rank in the workspace, lowest first. A user who can't open the workspace any more ranks `none`. */
const RANK = {
  none: 0,
  workspaceEditor: 1,
  workspaceManager: 2,
  organizationAdmin: 3,
  organizationOwner: 4,
} as const;

export interface AgentLockViewer {
  userId: string;
  workspaceRole: WorkspaceRole | null;
  organizationRole: string | null;
}

export function getWorkspaceRank({
  workspaceRole,
  organizationRole,
}: Omit<AgentLockViewer, 'userId'>): number {
  if (!workspaceRole) return RANK.none;
  if (organizationRole && hasOrganizationRole(organizationRole, ORGANIZATION_OWNER_ROLE)) {
    return RANK.organizationOwner;
  }
  if (organizationRole && hasOrganizationRole(organizationRole, ORGANIZATION_ADMIN_ROLE)) {
    return RANK.organizationAdmin;
  }
  return workspaceRole === WORKSPACE_MANAGER_ROLE ? RANK.workspaceManager : RANK.workspaceEditor;
}

/** One user of the agent's lock history, with the rank they hold today. */
export interface AgentLockActor {
  userId: string | null;
  rank: number;
}

export interface AgentLockState {
  lockedBy: AgentLockActor;
  /** Null while the version has no live approval. */
  approvedBy: AgentLockActor | null;
}

export interface AgentLockActions {
  canLock: boolean;
  canUnlock: boolean;
  canApprove: boolean;
  canRevoke: boolean;
}

interface GetAgentLockActionsParams {
  viewer: { userId: string; rank: number };
  /** Null while the agent is unlocked. */
  lock: AgentLockState | null;
}

/** Whether the viewer may undo what `actor` did: the same user, or someone of the same rank or above. */
function mayUndo(viewer: GetAgentLockActionsParams['viewer'], actor: AgentLockActor): boolean {
  return viewer.userId === actor.userId || viewer.rank >= actor.rank;
}

/** The one place that decides who may lock, unlock, approve and revoke an agent. */
export function getAgentLockActions({ viewer, lock }: GetAgentLockActionsParams): AgentLockActions {
  const canApproveRank = viewer.rank >= RANK.workspaceManager;
  if (!lock) {
    return {
      canLock: viewer.rank >= RANK.workspaceEditor,
      canUnlock: false,
      canApprove: canApproveRank,
      canRevoke: false,
    };
  }

  const canRevoke = lock.approvedBy !== null && mayUndo(viewer, lock.approvedBy);
  return {
    canLock: false,
    canUnlock: lock.approvedBy ? canRevoke : mayUndo(viewer, lock.lockedBy),
    canApprove: canApproveRank && lock.approvedBy === null,
    canRevoke,
  };
}

interface LockedVersionActors {
  lockedBy: { id: string } | null;
  approvedBy: { id: string } | null;
  approvedAt: Date | null;
  revokedAt: Date | null;
}

/** Ranks of the users in an agent's lock history. One query, only for a locked agent. */
async function loadLockState({
  workspaceId,
  lockedVersion,
}: {
  workspaceId: string;
  lockedVersion: LockedVersionActors;
}): Promise<AgentLockState> {
  const hasLiveApproval = lockedVersion.approvedAt !== null && lockedVersion.revokedAt === null;
  const lockerId = lockedVersion.lockedBy?.id ?? null;
  const approverId = hasLiveApproval ? (lockedVersion.approvedBy?.id ?? null) : null;
  const userIds = [lockerId, approverId].filter((userId): userId is string => userId !== null);

  const { error, data: roles } = await tryCatch(() =>
    getWorkspaceUserRoles({ workspaceId, userIds }),
  );
  if (error !== null || !roles) {
    logger.error('Failed to load the roles of the agent lock history', error);
    throw new InternalServerErrorException('Failed to load agent');
  }

  const toActor = (userId: string | null): AgentLockActor => {
    const roleRow = roles.find((row) => row.userId === userId);
    return { userId, rank: roleRow ? getWorkspaceRank(roleRow) : RANK.none };
  };

  return {
    lockedBy: toActor(lockerId),
    approvedBy: hasLiveApproval ? toActor(approverId) : null,
  };
}

export interface ResolveAgentLockActionsParams {
  viewer: AgentLockViewer;
  workspaceId: string;
  lockedVersion: LockedVersionActors | null;
}

export async function resolveAgentLockActions({
  viewer,
  workspaceId,
  lockedVersion,
}: ResolveAgentLockActionsParams): Promise<AgentLockActions> {
  const viewerRank = { userId: viewer.userId, rank: getWorkspaceRank(viewer) };
  if (!lockedVersion) return getAgentLockActions({ viewer: viewerRank, lock: null });

  const lock = await loadLockState({ workspaceId, lockedVersion });
  return getAgentLockActions({ viewer: viewerRank, lock });
}

export interface AgentLockUser {
  id: string;
  name: string;
}

export interface AgentLockResponse {
  versionId: string;
  versionNumber: number;
  lockedBy: AgentLockUser | null;
  lockedAt: Date;
  approval: { approvedBy: AgentLockUser | null; approvedAt: Date } | null;
}

interface LockedVersionRelation {
  id: string;
  versionNumber: number;
  lockedAt: Date;
  approvedAt: Date | null;
  revokedAt: Date | null;
  lockedBy: AgentLockUser | null;
  approvedBy: AgentLockUser | null;
}

export function toAgentLockResponse(
  lockedVersion: LockedVersionRelation | null,
): AgentLockResponse | null {
  if (!lockedVersion) return null;

  const hasLiveApproval = lockedVersion.approvedAt !== null && lockedVersion.revokedAt === null;
  return {
    versionId: lockedVersion.id,
    versionNumber: lockedVersion.versionNumber,
    lockedBy: lockedVersion.lockedBy,
    lockedAt: lockedVersion.lockedAt,
    approval:
      hasLiveApproval && lockedVersion.approvedAt
        ? { approvedBy: lockedVersion.approvedBy, approvedAt: lockedVersion.approvedAt }
        : null,
  };
}

interface AgentScope {
  workspaceId: string;
  agentId: string;
}

interface AgentLockRequest extends AgentScope {
  viewer: AgentLockViewer;
}

interface LoadedAgentLock {
  lock: AgentLockResponse | null;
  actions: AgentLockActions;
}

async function loadAgentRecord({ workspaceId, agentId }: AgentScope) {
  const { error, data: agentRecord } = await tryCatch(() =>
    getAgentByIdAndWorkspaceId({ agentId, workspaceId }),
  );
  if (error !== null) {
    logger.error('Failed to load agent', error);
    throw new InternalServerErrorException('Failed to load agent');
  }
  if (!agentRecord) throw new NotFoundException('Agent not found');

  return agentRecord;
}

async function loadAgentLock({
  workspaceId,
  agentId,
  viewer,
}: AgentLockRequest): Promise<LoadedAgentLock> {
  const agentRecord = await loadAgentRecord({ workspaceId, agentId });
  const actions = await resolveAgentLockActions({
    viewer,
    workspaceId,
    lockedVersion: agentRecord.lockedVersion,
  });
  return { lock: toAgentLockResponse(agentRecord.lockedVersion), actions };
}

export interface AgentLockMutationResponse {
  lock: AgentLockResponse | null;
}

async function respondWithCurrentLock(scope: AgentScope): Promise<AgentLockMutationResponse> {
  const agentRecord = await loadAgentRecord(scope);
  return { lock: toAgentLockResponse(agentRecord.lockedVersion) };
}

function throwInternalError(error: unknown, message: string): never {
  logger.error(message, error);
  throw new InternalServerErrorException(message);
}

/** [POST] /workspace/:workspaceId/agent/:agentId/lock */
export async function lockAgentForWorkspace(
  request: AgentLockRequest,
): Promise<AgentLockMutationResponse> {
  const { workspaceId, agentId, viewer } = request;
  const { lock, actions } = await loadAgentLock(request);
  if (lock) throw new AgentAlreadyLockedException();
  if (!actions.canLock) throw new ForbiddenException();

  const { error, data: result } = await tryCatch(() =>
    lockAgent({ agentId, workspaceId, userId: viewer.userId }),
  );
  if (error !== null || !result) throwInternalError(error, 'Failed to lock agent');

  if (result.status === 'not-found') throw new NotFoundException('Agent not found');
  if (result.status === 'already-locked') throw new AgentAlreadyLockedException();
  if (result.status === 'knowledge-files-not-ready') throw new KnowledgeFilesNotReadyException();

  return respondWithCurrentLock({ workspaceId, agentId });
}

/** [DELETE] /workspace/:workspaceId/agent/:agentId/lock */
export async function unlockAgentForWorkspace(
  request: AgentLockRequest,
): Promise<AgentLockMutationResponse> {
  const { workspaceId, agentId, viewer } = request;
  const { lock, actions } = await loadAgentLock(request);
  if (!lock) throw new AgentNotLockedException();
  if (!actions.canUnlock) throw new ForbiddenException();

  const { error, data: result } = await tryCatch(() =>
    unlockAgent({ agentId, workspaceId, userId: viewer.userId }),
  );
  if (error !== null || !result) throwInternalError(error, 'Failed to unlock agent');

  if (result.status === 'not-locked') throw new AgentNotLockedException();

  return { lock: null };
}

/** [POST] /workspace/:workspaceId/agent/:agentId/unattended-approval */
export async function approveAgentForWorkspace(
  request: AgentLockRequest,
): Promise<AgentLockMutationResponse> {
  const { workspaceId, agentId, viewer } = request;
  const { lock, actions } = await loadAgentLock(request);
  if (lock?.approval) throw new AgentAlreadyApprovedException();
  if (!actions.canApprove) throw new ForbiddenException();

  const { error, data: result } = await tryCatch(() =>
    approveAgent({ agentId, workspaceId, userId: viewer.userId }),
  );
  if (error !== null || !result) throwInternalError(error, 'Failed to approve agent');

  if (result.status === 'not-found') throw new NotFoundException('Agent not found');
  if (result.status === 'already-approved') throw new AgentAlreadyApprovedException();
  if (result.status === 'knowledge-files-not-ready') throw new KnowledgeFilesNotReadyException();

  return respondWithCurrentLock({ workspaceId, agentId });
}

/** [DELETE] /workspace/:workspaceId/agent/:agentId/unattended-approval */
export async function revokeAgentApprovalForWorkspace(
  request: AgentLockRequest,
): Promise<AgentLockMutationResponse> {
  const { workspaceId, agentId, viewer } = request;
  const { lock, actions } = await loadAgentLock(request);
  if (!lock?.approval) throw new AgentNotApprovedException();
  if (!actions.canRevoke) throw new ForbiddenException();

  const { error, data: revokedVersion } = await tryCatch(() =>
    revokeAgentApproval({ agentId, workspaceId, userId: viewer.userId }),
  );
  if (error !== null) throwInternalError(error, 'Failed to revoke approval');
  if (!revokedVersion) throw new AgentNotApprovedException();

  return respondWithCurrentLock({ workspaceId, agentId });
}

type AgentVersionRow = Awaited<ReturnType<typeof listAgentVersions>>[number];

export interface AgentVersionListResponse {
  versions: AgentVersionRow[];
}

/** [GET] /workspace/:workspaceId/agent/:agentId/versions */
export async function listAgentVersionsForWorkspace({
  workspaceId,
  agentId,
}: AgentScope): Promise<AgentVersionListResponse> {
  await loadAgentRecord({ workspaceId, agentId });

  const { error, data: versions } = await tryCatch(() =>
    listAgentVersions({ agentId, workspaceId }),
  );
  if (error !== null || !versions) throwInternalError(error, 'Failed to list agent versions');

  return { versions };
}

/** [GET] /workspace/:workspaceId/agent/:agentId/usage */
export async function getAgentUsageForWorkspace({
  workspaceId,
  agentId,
}: AgentScope): Promise<AgentUsage> {
  await loadAgentRecord({ workspaceId, agentId });

  const { error, data: usage } = await tryCatch(() => getAgentUsage({ agentId, workspaceId }));
  if (error !== null || !usage) throwInternalError(error, 'Failed to load agent usage');

  return usage;
}
