import { CloudDriveError } from '../errors';
import type {
  CloudDriveFileContent,
  CloudDriveFileFormat,
  CloudDriveItem,
  CloudDrivePage,
  CloudDriveProvider,
  CloudDriveProviderOptions,
  CreateCloudDriveFileParams,
  GetCloudDriveItemParams,
  ListCloudDriveFolderParams,
  ReadCloudDriveContentParams,
  SearchCloudDriveParams,
  UpdateCloudDriveFileParams,
} from '../cloud-drive.types';
import { createGoogleDriveClient, withDriveErrors } from './google-drive.client';
import { parseDriveFile, parseDriveFileList } from './google-drive.parse';

const ITEM_FIELDS = 'id,name,mimeType,size,modifiedTime,webViewLink';
const PAGE_SIZE = '50';

/** Native Google types can't be downloaded; they are exported to a readable format. */
const EXPORT_MIME_TYPES: Readonly<Record<string, string>> = {
  'application/vnd.google-apps.document': 'text/markdown',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};
const FORMAT_MIME_TYPES: Readonly<Record<CloudDriveFileFormat, string>> = {
  markdown: 'text/markdown',
  text: 'text/plain',
  csv: 'text/csv',
};
const TEXT_MIME_PREFIX = 'text/';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const MULTIPART_BOUNDARY = 'ragna-drive-upload';
const NATIVE_MIME_PREFIX = 'application/vnd.google-apps.';

interface UploadRequest {
  method: 'POST' | 'PATCH';
  headers: Readonly<Record<string, string>>;
  body: string;
}

function buildMultipartBody(metadata: object, mimeType: string, content: string): string {
  return [
    `--${MULTIPART_BOUNDARY}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${MULTIPART_BOUNDARY}`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${MULTIPART_BOUNDARY}--`,
  ].join('\r\n');
}

function escapeQueryLiteral(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function buildListParams(q: string, cursor: string | undefined): URLSearchParams {
  const params = new URLSearchParams({
    q,
    fields: `nextPageToken,files(${ITEM_FIELDS})`,
    pageSize: PAGE_SIZE,
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  });
  if (cursor) params.set('pageToken', cursor);
  return params;
}

export function createGoogleDriveProvider(options: CloudDriveProviderOptions): CloudDriveProvider {
  const client = createGoogleDriveClient(options);

  async function listFiles(q: string, cursor: string | undefined): Promise<CloudDrivePage> {
    const body = await withDriveErrors(() =>
      client.request<unknown>(`files?${buildListParams(q, cursor)}`),
    );
    return parseDriveFileList(body);
  }

  async function getItem({ itemId }: GetCloudDriveItemParams): Promise<CloudDriveItem> {
    const params = new URLSearchParams({ fields: ITEM_FIELDS, supportsAllDrives: 'true' });
    const body = await withDriveErrors(() =>
      client.request<unknown>(`files/${encodeURIComponent(itemId)}?${params}`),
    );
    return parseDriveFile(body);
  }

  async function fetchBytes(path: string, maxBytes: number): Promise<Buffer> {
    const response = await withDriveErrors(() =>
      client.requestRaw(path, { method: 'GET', authorize: true }),
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new CloudDriveError('too_large');
    return bytes;
  }

  async function readContent({
    itemId,
    maxBytes,
  }: ReadCloudDriveContentParams): Promise<CloudDriveFileContent> {
    const item = await getItem({ itemId });
    const id = encodeURIComponent(itemId);

    const exportMimeType = EXPORT_MIME_TYPES[item.mimeType ?? ''];
    if (exportMimeType) {
      const params = new URLSearchParams({ mimeType: exportMimeType });
      const bytes = await fetchBytes(`files/${id}/export?${params}`, maxBytes);
      return { item, mimeType: exportMimeType, bytes };
    }

    if (item.kind === 'folder' || item.mimeType?.startsWith(NATIVE_MIME_PREFIX)) {
      throw new CloudDriveError('unsupported');
    }
    if (item.sizeBytes !== null && item.sizeBytes > maxBytes)
      throw new CloudDriveError('too_large');

    const bytes = await fetchBytes(`files/${id}?alt=media&supportsAllDrives=true`, maxBytes);
    return { item, mimeType: item.mimeType ?? 'application/octet-stream', bytes };
  }

  async function sendUpload(url: string, init: UploadRequest): Promise<CloudDriveItem> {
    const response = await withDriveErrors(() =>
      client.requestRaw(url, {
        method: init.method,
        body: init.body,
        headers: init.headers,
        authorize: true,
      }),
    );
    return parseDriveFile(await response.json());
  }

  async function createFile({
    name,
    folderId,
    format,
    content,
  }: CreateCloudDriveFileParams): Promise<CloudDriveItem> {
    const mimeType = FORMAT_MIME_TYPES[format];
    const metadata: { name: string; mimeType: string; parents?: string[] } = { name, mimeType };
    if (folderId !== null) metadata.parents = [folderId];
    const params = new URLSearchParams({
      uploadType: 'multipart',
      supportsAllDrives: 'true',
      fields: ITEM_FIELDS,
    });
    return sendUpload(`${UPLOAD_API}/files?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
      body: buildMultipartBody(metadata, mimeType, content),
    });
  }

  async function updateFileContent({
    itemId,
    content,
  }: UpdateCloudDriveFileParams): Promise<CloudDriveItem> {
    const item = await getItem({ itemId });
    const mimeType = item.mimeType ?? '';
    if (item.kind === 'folder' || !mimeType.startsWith(TEXT_MIME_PREFIX)) {
      throw new CloudDriveError('unsupported');
    }
    const params = new URLSearchParams({
      uploadType: 'media',
      supportsAllDrives: 'true',
      fields: ITEM_FIELDS,
    });
    return sendUpload(`${UPLOAD_API}/files/${encodeURIComponent(itemId)}?${params}`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: content,
    });
  }

  return {
    search: ({ query, cursor }: SearchCloudDriveParams) => {
      const literal = escapeQueryLiteral(query);
      return listFiles(
        `(fullText contains '${literal}' or name contains '${literal}') and trashed = false`,
        cursor,
      );
    },
    listFolder: ({ folderId, cursor }: ListCloudDriveFolderParams) =>
      listFiles(
        `'${escapeQueryLiteral(folderId ?? 'root')}' in parents and trashed = false`,
        cursor,
      ),
    getItem,
    readContent,
    createFile,
    updateFileContent,
  };
}
