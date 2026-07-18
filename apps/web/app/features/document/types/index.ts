export interface Document {
  id: string;
  workspaceId: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  content: string;
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdByAgentId: string | null;
  createdByAgentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentResponse {
  document: Document;
}

export interface DocumentManyResponse {
  documents: Document[];
}

export type CreateDocumentRequest = {
  title: string;
  content?: string;
  folderId?: string | null;
};

export type UpdateDocumentRequest = {
  title?: string;
  content?: string;
  folderId?: string | null;
};

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface FolderResponse {
  folder: Folder;
}

export interface FolderManyResponse {
  folders: Folder[];
}
