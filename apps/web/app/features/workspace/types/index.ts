export type WorkspaceVisibility = 'personal' | 'organization' | 'restricted';
export type WorkspaceRole = 'manager' | 'editor';

/** A workspace the caller can open, with the caller's effective role in it. */
export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  visibility: WorkspaceVisibility;
  workspaceRole: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceManyResponse {
  workspaces: Workspace[];
}

/** `POST`/`PATCH /workspace` answer with the stored row, which has no caller role. */
export interface WorkspaceResponse {
  workspace: Omit<Workspace, 'workspaceRole'>;
}

export interface CreateWorkspaceInput {
  name: string;
  visibility: Exclude<WorkspaceVisibility, 'personal'>;
  memberUserIds?: string[];
}

export interface WorkspaceMember {
  userId: string;
  workspaceRole: WorkspaceRole;
  createdAt: string;
  name: string;
  email: string;
  image: string | null;
}

export interface WorkspaceMembersResponse {
  members: WorkspaceMember[];
}

export interface RestrictedWorkspace {
  id: string;
  name: string;
  memberCount: number;
  isWorkspaceMember: boolean;
  createdAt: string;
}

export interface RestrictedWorkspacesResponse {
  workspaces: RestrictedWorkspace[];
}
