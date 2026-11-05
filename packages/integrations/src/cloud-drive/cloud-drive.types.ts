export type CloudDriveItemKind = 'folder' | 'file';

export interface CloudDriveItem {
  /** Opaque. Only valid with the connection it came from. */
  id: string;
  name: string;
  kind: CloudDriveItemKind;
  mimeType: string | null;
  sizeBytes: number | null;
  modifiedAt: Date;
  webUrl: string;
}

export interface CloudDrivePage {
  items: CloudDriveItem[];
  /** Opaque: a page token or a next link. */
  nextCursor: string | null;
}

export interface CloudDriveFileContent {
  /** The file's metadata, so callers need no second lookup. */
  item: CloudDriveItem;
  /** After export, for vendor-native files. */
  mimeType: string;
  bytes: Buffer;
}

export type CloudDriveFileFormat = 'markdown' | 'text' | 'csv';

export interface SearchCloudDriveParams {
  query: string;
  cursor?: string;
}

export interface ListCloudDriveFolderParams {
  /** `null` is the drive root. */
  folderId: string | null;
  cursor?: string;
}

export interface GetCloudDriveItemParams {
  itemId: string;
}

export interface ReadCloudDriveContentParams {
  itemId: string;
  maxBytes: number;
}

export interface CreateCloudDriveFileParams {
  name: string;
  /** `null` is the drive root. */
  folderId: string | null;
  format: CloudDriveFileFormat;
  content: string;
}

export interface UpdateCloudDriveFileParams {
  itemId: string;
  content: string;
}

export interface CloudDriveProvider {
  search(params: SearchCloudDriveParams): Promise<CloudDrivePage>;
  listFolder(params: ListCloudDriveFolderParams): Promise<CloudDrivePage>;
  getItem(params: GetCloudDriveItemParams): Promise<CloudDriveItem>;
  readContent(params: ReadCloudDriveContentParams): Promise<CloudDriveFileContent>;
  createFile(params: CreateCloudDriveFileParams): Promise<CloudDriveItem>;
  updateFileContent(params: UpdateCloudDriveFileParams): Promise<CloudDriveItem>;
}

/** What every cloud drive provider factory receives. Providers never refresh or cache tokens. */
export interface CloudDriveProviderOptions {
  /** Resolves a fresh, valid OAuth access token for the connection. */
  getAccessToken: () => Promise<string>;
  /** Waits between retries of a vendor call. Defaults to a timer; tests record instead. */
  sleep?: (ms: number) => Promise<void>;
}

export type ResolvedCloudDrive =
  | { status: 'ready'; provider: CloudDriveProvider; connectionId: string }
  | { status: 'not_connected' }
  | { status: 'needs_reauth'; connectionId: string };
