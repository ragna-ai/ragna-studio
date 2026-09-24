import { isMailAuthError, MailProviderError } from '../errors';
import type { GraphErrorBody, GraphUploadChunkOutcome } from './graph.types';
import type { UploadSession } from '@microsoft/microsoft-graph-types';

const GRAPH_API_BASE_URL = 'https://graph.microsoft.com/v1.0';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;

export class GraphApiError extends MailProviderError {
  constructor(
    message: string,
    status: number,
    body?: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message, status, body);
    this.name = 'GraphApiError';
  }

  static async fromResponse(response: Response, label = 'Graph API error', request?: string): Promise<GraphApiError> {
    const body = await response.text();
    const graphError = parseGraphError(body);
    const details = [request, graphError?.code, graphError?.message].filter(Boolean).join(' | ');
    return new GraphApiError(
      `${label}: ${response.status} ${response.statusText}${details ? ` (${details})` : ''}`,
      response.status,
      body,
      parseRetryAfterMs(response.headers.get('Retry-After')),
    );
  }
}

/** 410, or a `syncStateNotFound`/`resyncRequired` error code: the delta link can no longer be resolved. */
export function isGraphDeltaExpired(error: unknown): boolean {
  if (!(error instanceof GraphApiError)) return false;
  if (error.status === 410) return true;
  const code = parseGraphErrorCode(error.body);
  return code === 'syncStateNotFound' || code === 'resyncRequired';
}

function parseGraphErrorCode(body: string | undefined): string | undefined {
  return parseGraphError(body)?.code;
}

function parseGraphError(body: string | undefined): GraphErrorBody['error'] {
  if (!body) return undefined;
  try {
    return (JSON.parse(body) as GraphErrorBody).error;
  } catch {
    return undefined;
  }
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - Date.now());
}

export interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: string;
}

/** GETs/writes a Graph path (relative to v1.0/, or an absolute nextLink/deltaLink URL), retrying transient and auth failures. */
export async function graphRequest<T>(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GraphRequestOptions = {},
): Promise<T> {
  return withGraphRetries(() => performGraphRequest<T>(getAccessToken, path, options));
}

/** Same as `graphRequest`, for endpoints that reply with an empty body (e.g. `DELETE`, `.../send`). */
export async function graphRequestVoid(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GraphRequestOptions = {},
): Promise<void> {
  return withGraphRetries(() => performGraphRequestVoid(getAccessToken, path, options));
}

async function performGraphRequest<T>(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GraphRequestOptions,
): Promise<T> {
  const response = await fetchGraph(getAccessToken, path, options);
  return (await response.json()) as T;
}

async function performGraphRequestVoid(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GraphRequestOptions,
): Promise<void> {
  await fetchGraph(getAccessToken, path, options);
}

function toRequestUrl(path: string): string {
  return path.startsWith('http') ? path : `${GRAPH_API_BASE_URL}/${path}`;
}

async function fetchGraph(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GraphRequestOptions,
): Promise<Response> {
  const accessToken = await getAccessToken();

  const response = await fetch(toRequestUrl(path), {
    method: options.method ?? 'GET',
    body: options.body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      // Without this, a message's id changes when it moves folder, breaking our unique index on it.
      Prefer: 'IdType="ImmutableId"',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw await GraphApiError.fromResponse(response, 'Graph API error', `${options.method ?? 'GET'} ${path}`);
  }

  return response;
}

// Hand-rolled instead of retryExpoBackoff: honouring Retry-After needs a per-attempt delay override it can't take.
async function withGraphRetries<T>(perform: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await perform();
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableGraphError(error)) {
        throw error;
      }
      await sleep(nextRetryDelayMs(error, attempt));
      attempt++;
    }
  }
}

function isRetryableGraphError(error: unknown): boolean {
  return error instanceof GraphApiError && (error.status === 429 || error.status >= 500 || isMailAuthError(error));
}

function nextRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof GraphApiError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GraphChunkUploadRange {
  start: number;
  end: number;
  total: number;
}

// The upload URL is pre-authenticated; Graph rejects the chunk PUT if it carries an Authorization header.
export async function putUploadSessionChunk(
  uploadUrl: string,
  chunk: Buffer,
  range: GraphChunkUploadRange,
): Promise<GraphUploadChunkOutcome> {
  return withGraphRetries(() => performUploadChunk(uploadUrl, chunk, range));
}

async function performUploadChunk(
  uploadUrl: string,
  chunk: Buffer,
  range: GraphChunkUploadRange,
): Promise<GraphUploadChunkOutcome> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    // Buffer.buffer is ArrayBufferLike, narrower than BodyInit wants; copy into a fresh ArrayBuffer-backed view.
    body: Uint8Array.from(chunk),
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(chunk.byteLength),
      'Content-Range': `bytes ${range.start}-${range.end}/${range.total}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  // The final chunk returns 201 with an empty body and the attachment id only in the Location header.
  if (response.status === 201) {
    const attachmentId = extractAttachmentIdFromLocation(response.headers.get('Location'));
    if (!attachmentId) {
      throw new GraphApiError('Upload session completed without an attachment id in the Location header', response.status);
    }
    return { status: 'completed', attachmentId };
  }

  if (!response.ok) {
    throw await GraphApiError.fromResponse(response, 'Graph upload session chunk failed');
  }

  const body = (await response.json()) as UploadSession;
  return { status: 'pending', nextRangeStart: parseNextRangeStart(body.nextExpectedRanges) };
}

function extractAttachmentIdFromLocation(location: string | null): string | null {
  const match = location?.match(/Attachments\('([^']+)'\)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseNextRangeStart(ranges: string[] | null | undefined): number {
  const start = ranges?.[0] ? Number.parseInt(ranges[0], 10) : Number.NaN;
  if (Number.isNaN(start)) {
    throw new GraphApiError('Upload session response is missing nextExpectedRanges', 502);
  }
  return start;
}
