import type {
  CloudDriveIntegrationId,
  IntegrationToolAccessLevel,
  IntegrationTools,
} from '@repo/integrations/catalog';
import {
  CloudDriveError,
  resolveUserCloudDrive,
  type CloudDriveFileContent,
  type CloudDriveItem,
  type CloudDrivePage,
  type CloudDriveProvider,
} from '@repo/integrations/cloud-drive';
import { ConnectionIntegrationDisabledError, ConnectionNeedsReauthError } from '@repo/integrations';
import { logger } from '@repo/logger';
import { extractText, MIME_TYPE_BY_MEDIA_KIND, type MediaKind } from '@repo/media';
import type { Tool, ToolSet } from 'ai';
import { tool } from 'ai';
import * as z from 'zod';
import type { ToolDefinition } from './tool-definition';

export const CLOUD_DRIVE_READ_MAX_BYTES = 20 * 1024 * 1024;
export const CLOUD_DRIVE_READ_MAX_CHARACTERS = 100_000;

const DRIVE_DISPLAY_NAMES: Record<CloudDriveIntegrationId, string> = {
  'google-drive': 'Google Drive',
};

// Providers hand these back already decoded: native files are exported to them.
const PLAIN_TEXT_MIME_TYPES: readonly string[] = ['text/markdown', 'text/csv', 'text/plain'];

const EXTRACTABLE_MEDIA_KINDS: readonly MediaKind[] = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'csv',
  'txt',
  'md',
];

export type CloudDriveToolStatus =
  | 'ok'
  | 'not_connected'
  | 'reconnect'
  | 'not_found'
  | 'read_only'
  | 'unsupported'
  | 'too_large'
  | 'busy';

export interface CloudDriveToolFailure {
  status: Exclude<CloudDriveToolStatus, 'ok'>;
  /** Short, model-facing explanation. Never contains a token. */
  message: string;
}

export interface CloudDriveItemOutput {
  id: string;
  name: string;
  kind: CloudDriveItem['kind'];
  mimeType: string | null;
  modifiedAt: string;
  webUrl: string;
  sizeBytes: number | null;
}

export interface CloudDriveListOutput {
  status: 'ok';
  items: CloudDriveItemOutput[];
  nextCursor: string | null;
}

export interface CloudDriveReadFileOutput {
  status: 'ok';
  name: string;
  mimeType: string;
  webUrl: string;
  text: string;
  truncated: boolean;
}

export interface CloudDriveWriteOutput {
  status: 'ok';
  id: string;
  name: string;
  webUrl: string;
}

export type CloudDriveWriteResult = CloudDriveWriteOutput | CloudDriveToolFailure;
export type CloudDriveListResult = CloudDriveListOutput | CloudDriveToolFailure;
export type CloudDriveReadFileResult = CloudDriveReadFileOutput | CloudDriveToolFailure;
export type CloudDriveToolResult =
  | CloudDriveListResult
  | CloudDriveReadFileResult
  | CloudDriveWriteResult;

const searchInputSchema = z.object({
  query: z.string().min(1).describe('Words to search for.'),
  cursor: z.string().optional().describe('nextCursor from the previous page.'),
});

const listFolderInputSchema = z.object({
  folderId: z.string().optional().describe('Folder id from a previous result. Omit for the root.'),
  cursor: z.string().optional().describe('nextCursor from the previous page.'),
});

const readFileInputSchema = z.object({
  fileId: z.string().describe('File id from a search or folder listing.'),
});

const createFileInputSchema = z.object({
  name: z.string().min(1).describe('File name including its extension, for example notes.md.'),
  folderId: z.string().optional().describe('Folder id from a previous result. Omit for the root.'),
  format: z.enum(['markdown', 'text', 'csv']).describe('How the content is formatted.'),
  content: z.string().describe('The complete text of the new file.'),
});

const updateFileInputSchema = z.object({
  fileId: z.string().describe('Id of a plain text, Markdown or CSV file.'),
  content: z.string().describe('The complete new text. It replaces the current content.'),
});

function toCamelCase(id: string): string {
  return id.replace(/-(\w)/g, (_match, letter: string) => letter.toUpperCase());
}

function toItemOutput(item: CloudDriveItem): CloudDriveItemOutput {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    mimeType: item.mimeType,
    modifiedAt: item.modifiedAt.toISOString(),
    webUrl: item.webUrl,
    sizeBytes: item.sizeBytes,
  };
}

function toListOutput(page: CloudDrivePage): CloudDriveListOutput {
  return { status: 'ok', items: page.items.map(toItemOutput), nextCursor: page.nextCursor };
}

function failureMessages(driveName: string): Record<CloudDriveToolFailure['status'], string> {
  return {
    not_connected: `${driveName} is not connected for this user. Ask them to connect it in settings.`,
    reconnect: `The ${driveName} connection needs to be renewed. Ask the user to reconnect it in settings.`,
    not_found: `That item does not exist in ${driveName} or is not visible to this user.`,
    read_only: `This file in ${driveName} is read-only for RAGNA Studio.`,
    unsupported: `This kind of item cannot be read as text.`,
    too_large: `This file is too large to read.`,
    busy: `${driveName} is busy or failed unexpectedly. Try again shortly.`,
  };
}

const FAILURE_STATUS_BY_ERROR_KIND: Record<
  CloudDriveError['kind'],
  CloudDriveToolFailure['status']
> = {
  not_found: 'not_found',
  read_only: 'read_only',
  too_large: 'too_large',
  rate_limited: 'busy',
  auth: 'reconnect',
  unsupported: 'unsupported',
};

function toFailureStatus(error: unknown): CloudDriveToolFailure['status'] {
  if (error instanceof CloudDriveError) return FAILURE_STATUS_BY_ERROR_KIND[error.kind];
  if (error instanceof ConnectionIntegrationDisabledError) return 'not_connected';
  if (error instanceof ConnectionNeedsReauthError) return 'reconnect';
  logger.error('Cloud drive tool failed', error instanceof Error ? error.name : 'unknown error');
  return 'busy';
}

interface RunOnDriveParams<Result> {
  integrationId: CloudDriveIntegrationId;
  userId: string;
  run: (provider: CloudDriveProvider) => Promise<Result>;
}

/** Resolves the run user's own drive, runs the call and turns every failure into a result. */
async function runOnDrive<Result>({
  integrationId,
  userId,
  run,
}: RunOnDriveParams<Result>): Promise<Result | CloudDriveToolFailure> {
  const messages = failureMessages(DRIVE_DISPLAY_NAMES[integrationId]);
  const failure = (status: CloudDriveToolFailure['status']): CloudDriveToolFailure => ({
    status,
    message: messages[status],
  });

  try {
    const drive = await resolveUserCloudDrive({ userId, integrationId });
    if (drive.status === 'not_connected') return failure('not_connected');
    if (drive.status === 'needs_reauth') return failure('reconnect');
    return await run(drive.provider);
  } catch (error) {
    return failure(toFailureStatus(error));
  }
}

function toBareMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

/** Returns null when the content is not text the agent can read (images, archives, ...). */
async function decodeContentText(content: CloudDriveFileContent): Promise<string | null> {
  const mimeType = toBareMimeType(content.mimeType);
  if (PLAIN_TEXT_MIME_TYPES.includes(mimeType)) return content.bytes.toString('utf-8');

  const kind = EXTRACTABLE_MEDIA_KINDS.find((entry) => MIME_TYPE_BY_MEDIA_KIND[entry] === mimeType);
  if (kind === undefined) return null;
  try {
    return await extractText({ buffer: content.bytes, kind });
  } catch {
    return null;
  }
}

async function readFile(
  provider: CloudDriveProvider,
  fileId: string,
): Promise<CloudDriveReadFileOutput | 'unsupported'> {
  const content = await provider.readContent({
    itemId: fileId,
    maxBytes: CLOUD_DRIVE_READ_MAX_BYTES,
  });
  const text = await decodeContentText(content);
  if (text === null) return 'unsupported';

  return {
    status: 'ok',
    name: content.item.name,
    mimeType: content.mimeType,
    webUrl: content.item.webUrl,
    text: text.slice(0, CLOUD_DRIVE_READ_MAX_CHARACTERS),
    truncated: text.length > CLOUD_DRIVE_READ_MAX_CHARACTERS,
  };
}

function toWriteOutput(item: CloudDriveItem): CloudDriveWriteOutput {
  return { status: 'ok', id: item.id, name: item.name, webUrl: item.webUrl };
}

/** Every tool the given drive offers. */
export function cloudDriveToolDefinitions(
  integrationId: CloudDriveIntegrationId,
): ToolDefinition<z.ZodObject, unknown>[] {
  const driveName = DRIVE_DISPLAY_NAMES[integrationId];
  const prefix = toCamelCase(integrationId);

  const searchDefinition: ToolDefinition<typeof searchInputSchema, CloudDriveListResult> = {
    name: `${prefix}Search`,
    description: `Search the user's ${driveName} by file name and content. Returns matching files and folders, and a nextCursor when there are more results.`,
    inputSchema: searchInputSchema,
    access: 'read',
    annotations: { readOnlyHint: true },
    execute: (input, ctx) =>
      runOnDrive({
        integrationId,
        userId: ctx.userId,
        run: async (provider) =>
          toListOutput(await provider.search({ query: input.query, cursor: input.cursor })),
      }),
  };

  const listFolderDefinition: ToolDefinition<typeof listFolderInputSchema, CloudDriveListResult> = {
    name: `${prefix}ListFolder`,
    description: `List the files and folders inside one ${driveName} folder. Omit folderId for the top level. Returns a nextCursor when there are more items.`,
    inputSchema: listFolderInputSchema,
    access: 'read',
    annotations: { readOnlyHint: true },
    execute: (input, ctx) =>
      runOnDrive({
        integrationId,
        userId: ctx.userId,
        run: async (provider) =>
          toListOutput(
            await provider.listFolder({ folderId: input.folderId ?? null, cursor: input.cursor }),
          ),
      }),
  };

  const readFileDefinition: ToolDefinition<typeof readFileInputSchema, CloudDriveReadFileResult> = {
    name: `${prefix}ReadFile`,
    description: `Read the text of one ${driveName} file. Works for documents, spreadsheets, presentations, PDFs, Word, PowerPoint, Excel, CSV, text and Markdown files. Long files are cut off and marked truncated.`,
    inputSchema: readFileInputSchema,
    access: 'read',
    annotations: { readOnlyHint: true },
    execute: async (input, ctx) => {
      const messages = failureMessages(driveName);
      const result = await runOnDrive({
        integrationId,
        userId: ctx.userId,
        run: (provider) => readFile(provider, input.fileId),
      });
      if (result === 'unsupported') {
        return { status: 'unsupported', message: messages.unsupported };
      }
      return result;
    },
  };

  const createFileDefinition: ToolDefinition<typeof createFileInputSchema, CloudDriveWriteResult> =
    {
      name: `${prefix}CreateFile`,
      description: `Create a new text, Markdown or CSV file in the user's ${driveName}. In chat the user reviews the file and approves it first. Omit folderId for the top level.`,
      inputSchema: createFileInputSchema,
      access: 'write',
      annotations: { readOnlyHint: false, destructiveHint: false },
      execute: (input, ctx) =>
        runOnDrive({
          integrationId,
          userId: ctx.userId,
          run: async (provider) =>
            toWriteOutput(
              await provider.createFile({
                name: input.name,
                folderId: input.folderId ?? null,
                format: input.format,
                content: input.content,
              }),
            ),
        }),
    };

  const updateFileDefinition: ToolDefinition<typeof updateFileInputSchema, CloudDriveWriteResult> =
    {
      name: `${prefix}UpdateFile`,
      description: `Replace the content of an existing plain text, Markdown or CSV file in the user's ${driveName}. In chat the user reviews the new content and approves it first. Google Docs and Sheets cannot be updated.`,
      inputSchema: updateFileInputSchema,
      access: 'write',
      annotations: { readOnlyHint: false, destructiveHint: true },
      execute: (input, ctx) =>
        runOnDrive({
          integrationId,
          userId: ctx.userId,
          run: async (provider) =>
            toWriteOutput(
              await provider.updateFileContent({ itemId: input.fileId, content: input.content }),
            ),
        }),
    };

  return [
    searchDefinition,
    listFolderDefinition,
    readFileDefinition,
    createFileDefinition,
    updateFileDefinition,
  ];
}

export interface GetCloudDriveToolsParams {
  integrationId: CloudDriveIntegrationId;
  level: IntegrationToolAccessLevel;
  userId: string;
  workspaceId: string;
}

/** AI SDK tools for one drive. A `read` level gets read tools only, `write` gets all. */
export function getCloudDriveTools({
  integrationId,
  level,
  userId,
  workspaceId,
}: GetCloudDriveToolsParams): ToolSet {
  const allowed = cloudDriveToolDefinitions(integrationId).filter(
    (definition) => level === 'write' || definition.access === 'read',
  );
  const entries = allowed.map((definition): [string, Tool] => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: (input) => definition.execute(input, { userId, workspaceId, origin: 'agent' }),
    }),
  ]);
  return Object.fromEntries(entries);
}

const CLOUD_DRIVE_INTEGRATION_IDS =
  Object.keys(DRIVE_DISPLAY_NAMES).filter(isCloudDriveIntegrationId);

/** Asks the user before any cloud drive write tool in `tools` runs. */
export function buildCloudDriveToolApproval(tools: ToolSet): Record<string, 'user-approval'> {
  const approval: Record<string, 'user-approval'> = {};
  for (const integrationId of CLOUD_DRIVE_INTEGRATION_IDS) {
    for (const definition of cloudDriveToolDefinitions(integrationId)) {
      if (definition.access === 'write' && definition.name in tools) {
        approval[definition.name] = 'user-approval';
      }
    }
  }
  return approval;
}

export interface GetAgentCloudDriveToolsParams {
  integrationTools: IntegrationTools;
  userId: string;
  workspaceId: string;
}

function isCloudDriveIntegrationId(id: string): id is CloudDriveIntegrationId {
  return id in DRIVE_DISPLAY_NAMES;
}

/** The tools of every drive the agent's editor switched on, at the level they chose. */
export function getAgentCloudDriveTools({
  integrationTools,
  userId,
  workspaceId,
}: GetAgentCloudDriveToolsParams): ToolSet {
  const tools: ToolSet = {};
  for (const [integrationId, level] of Object.entries(integrationTools)) {
    if (!level || !isCloudDriveIntegrationId(integrationId)) continue;
    Object.assign(tools, getCloudDriveTools({ integrationId, level, userId, workspaceId }));
  }
  return tools;
}
