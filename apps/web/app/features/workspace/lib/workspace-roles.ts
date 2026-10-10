import type { Workspace, WorkspaceRole } from '~/features/workspace/types';

export const WORKSPACE_ROLES = [
  'manager',
  'editor',
] as const satisfies readonly WorkspaceRole[];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === 'manager' || value === 'editor';
}

/** Managers rename and delete the workspace and run its members. */
export function canManageWorkspace(workspace: Workspace): boolean {
  return workspace.workspaceRole === 'manager';
}

export function canDeleteWorkspace(workspace: Workspace): boolean {
  return canManageWorkspace(workspace) && workspace.visibility !== 'personal';
}

export function hasWorkspaceMembers(workspace: Workspace): boolean {
  return workspace.visibility !== 'personal';
}
