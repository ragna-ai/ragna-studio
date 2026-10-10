import {
  deleteWorkspaceMember,
  filterActiveOrganizationMemberUserIds,
  insertWorkspaceMember,
  listWorkspaceMembers,
  updateWorkspaceMemberRole,
  WORKSPACE_MANAGER_ROLE,
  WORKSPACE_VISIBILITY_ORGANIZATION,
  WORKSPACE_VISIBILITY_PERSONAL,
  type Workspace,
  type WorkspaceRole,
} from '@repo/database';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../exceptions';

export interface WorkspaceMemberResponse {
  userId: string;
  workspaceRole: WorkspaceRole;
  createdAt: Date;
  name: string;
  email: string;
  image: string | null;
}

export interface WorkspaceMembersResponse {
  members: WorkspaceMemberResponse[];
}

interface WorkspaceMemberContext {
  workspace: Workspace;
  callerWorkspaceRole: WorkspaceRole;
}

function requireNotPersonal(workspace: Workspace): void {
  if (workspace.visibility === WORKSPACE_VISIBILITY_PERSONAL) {
    throw new BadRequestException('A personal workspace has no members');
  }
}

function requireManager(callerWorkspaceRole: WorkspaceRole): void {
  if (callerWorkspaceRole !== WORKSPACE_MANAGER_ROLE) throw new ForbiddenException();
}

/** Organization workspaces are open to every org member, so only manager rows carry meaning. */
function requireRoleAllowedFor(workspace: Workspace, workspaceRole: WorkspaceRole): void {
  if (
    workspace.visibility === WORKSPACE_VISIBILITY_ORGANIZATION &&
    workspaceRole !== WORKSPACE_MANAGER_ROLE
  ) {
    throw new BadRequestException('Organization workspaces only accept the manager role');
  }
}

/** [GET] /workspace/:workspaceId/members */
export async function listMembersOfWorkspace({
  workspace,
}: {
  workspace: Workspace;
}): Promise<WorkspaceMembersResponse> {
  requireNotPersonal(workspace);
  const rows = await listWorkspaceMembers({ workspaceId: workspace.id });

  return {
    members: rows.map((row) => ({
      userId: row.userId,
      workspaceRole: row.workspaceRole,
      createdAt: row.createdAt,
      name: row.name,
      email: row.email,
      image: row.image,
    })),
  };
}

/** [POST] /workspace/:workspaceId/members. Workspace managers only. */
export async function addMemberToWorkspace({
  workspace,
  callerWorkspaceRole,
  userId,
  workspaceRole,
}: WorkspaceMemberContext & { userId: string; workspaceRole: WorkspaceRole }): Promise<void> {
  requireNotPersonal(workspace);
  requireManager(callerWorkspaceRole);
  requireRoleAllowedFor(workspace, workspaceRole);

  const activeUserIds = await filterActiveOrganizationMemberUserIds({
    organizationId: workspace.organizationId,
    userIds: [userId],
  });
  if (activeUserIds.length === 0) {
    throw new BadRequestException('User is not an active member of this organization');
  }

  const inserted = await insertWorkspaceMember({
    workspaceId: workspace.id,
    userId,
    workspaceRole,
  });
  if (!inserted) throw new ConflictException('User is already a member of this workspace');
}

/** [PATCH] /workspace/:workspaceId/members/:userId. Workspace managers only. */
export async function changeWorkspaceMemberRole({
  workspace,
  callerWorkspaceRole,
  userId,
  workspaceRole,
}: WorkspaceMemberContext & { userId: string; workspaceRole: WorkspaceRole }): Promise<void> {
  requireNotPersonal(workspace);
  requireManager(callerWorkspaceRole);
  requireRoleAllowedFor(workspace, workspaceRole);

  const updated = await updateWorkspaceMemberRole({
    workspaceId: workspace.id,
    userId,
    workspaceRole,
  });
  if (!updated) throw new NotFoundException('Workspace member not found');
}

/** [DELETE] /workspace/:workspaceId/members/:userId. Workspace managers, or the member leaving. */
export async function removeWorkspaceMember({
  workspace,
  callerWorkspaceRole,
  callerUserId,
  userId,
}: WorkspaceMemberContext & { callerUserId: string; userId: string }): Promise<void> {
  requireNotPersonal(workspace);
  if (callerUserId !== userId) requireManager(callerWorkspaceRole);

  const deleted = await deleteWorkspaceMember({ workspaceId: workspace.id, userId });
  if (!deleted) throw new NotFoundException('Workspace member not found');
}
