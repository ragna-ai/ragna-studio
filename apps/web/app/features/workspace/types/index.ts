export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface WorkspaceResponse {
  workspace: Workspace;
}

export interface WorkspaceManyResponse {
  workspaces: Workspace[];
}
