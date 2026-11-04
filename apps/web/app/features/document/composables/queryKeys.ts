export type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

/** `root` is the API's filter value for documents that sit in no folder. */
export const ROOT_FOLDER_FILTER = 'root';

export const documentKeys = {
  all: (workspaceId: WorkspaceId) => ['documents', workspaceId] as const,
  list: (workspaceId: WorkspaceId) =>
    ['documents', workspaceId, 'list'] as const,
  listInFolder: (
    workspaceId: WorkspaceId,
    folderFilter: MaybeRefOrGetter<string>,
  ) => ['documents', workspaceId, 'list', folderFilter] as const,
  detail: (workspaceId: WorkspaceId, documentId: MaybeRefOrGetter<string>) =>
    ['documents', workspaceId, 'detail', documentId] as const,
};

export const folderKeys = {
  all: (workspaceId: WorkspaceId) => ['folders', workspaceId] as const,
  list: (workspaceId: WorkspaceId) => ['folders', workspaceId, 'list'] as const,
  detail: (
    workspaceId: WorkspaceId,
    folderId: MaybeRefOrGetter<string | null>,
  ) => ['folders', workspaceId, 'detail', folderId] as const,
};
