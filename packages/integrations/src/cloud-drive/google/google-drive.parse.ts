import * as z from 'zod';
import type { CloudDriveItem, CloudDrivePage } from '../cloud-drive.types';

export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

const driveFileSchema = z.object({
  id: z.string(),
  name: z.string().catch(''),
  mimeType: z.string().catch('application/octet-stream'),
  size: z.string().optional().catch(undefined),
  modifiedTime: z.string().optional().catch(undefined),
  webViewLink: z.string().optional().catch(undefined),
});

const driveFileListSchema = z.object({
  files: z.array(driveFileSchema).catch([]),
  nextPageToken: z.string().optional().catch(undefined),
});

function toModifiedAt(value: string | undefined): Date {
  const parsed = new Date(value ?? Number.NaN);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function toSizeBytes(value: string | undefined): number | null {
  if (value === undefined) return null;
  const size = Number(value);
  return Number.isFinite(size) ? size : null;
}

function toItem(file: z.infer<typeof driveFileSchema>): CloudDriveItem {
  const isFolder = file.mimeType === DRIVE_FOLDER_MIME_TYPE;
  return {
    id: file.id,
    name: file.name,
    kind: isFolder ? 'folder' : 'file',
    mimeType: file.mimeType,
    sizeBytes: toSizeBytes(file.size),
    modifiedAt: toModifiedAt(file.modifiedTime),
    webUrl: file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`,
  };
}

export function parseDriveFile(body: unknown): CloudDriveItem {
  return toItem(driveFileSchema.parse(body));
}

export function parseDriveFileList(body: unknown): CloudDrivePage {
  const list = driveFileListSchema.parse(body);
  return { items: list.files.map(toItem), nextCursor: list.nextPageToken ?? null };
}
