import {
  createVendorClient,
  MICROSOFT_GRAPH_API,
  VendorApiError,
  type VendorClient,
} from '@repo/integrations/http';
import type { UploadSession } from '@microsoft/microsoft-graph-types';
import type { MailProviderOptions } from '../mail-provider';
import type { GraphUploadChunkOutcome } from './graph.types';

const DELTA_EXPIRED_CODES = ['syncStateNotFound', 'resyncRequired'];

export function createGraphMailClient(options: MailProviderOptions): VendorClient {
  return createVendorClient(MICROSOFT_GRAPH_API, {
    getAccessToken: options.getAccessToken,
    sleep: options.sleep,
    // Without this, a message's id changes when it moves folder, breaking our unique index on it.
    headers: { Prefer: 'IdType="ImmutableId"' },
  });
}

/** For a Graph response that is missing something the mail contract needs. */
export function graphResponseError(detail: string, status = 502): VendorApiError {
  return new VendorApiError({ vendor: MICROSOFT_GRAPH_API.name, status, detail });
}

/** 410, or a `syncStateNotFound`/`resyncRequired` error code: the delta link can no longer be resolved. */
export function isGraphDeltaExpired(error: unknown): boolean {
  if (!(error instanceof VendorApiError)) return false;
  if (error.kind === 'gone') return true;
  return error.code !== undefined && DELTA_EXPIRED_CODES.includes(error.code);
}

export interface GraphChunkUploadRange {
  start: number;
  end: number;
  total: number;
}

// The upload URL is pre-authenticated; Graph rejects the chunk PUT if it carries an Authorization header.
export async function putUploadSessionChunk(
  client: VendorClient,
  uploadUrl: string,
  chunk: Buffer,
  range: GraphChunkUploadRange,
): Promise<GraphUploadChunkOutcome> {
  const response = await client.requestRaw(uploadUrl, {
    method: 'PUT',
    // Buffer.buffer is ArrayBufferLike, narrower than BodyInit wants; copy into a fresh ArrayBuffer-backed view.
    body: Uint8Array.from(chunk),
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(chunk.byteLength),
      'Content-Range': `bytes ${range.start}-${range.end}/${range.total}`,
    },
    authorize: false,
  });

  // The final chunk returns 201 with an empty body and the attachment id only in the Location header.
  if (response.status === 201) {
    const attachmentId = extractAttachmentIdFromLocation(response.headers.get('Location'));
    if (!attachmentId) {
      throw graphResponseError(
        'upload session completed without an attachment id in the Location header',
        response.status,
      );
    }
    return { status: 'completed', attachmentId };
  }

  const session: UploadSession = await response.json();
  return { status: 'pending', nextRangeStart: parseNextRangeStart(session.nextExpectedRanges) };
}

function extractAttachmentIdFromLocation(location: string | null): string | null {
  const match = location?.match(/Attachments\('([^']+)'\)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseNextRangeStart(ranges: string[] | null | undefined): number {
  const start = ranges?.[0] ? Number.parseInt(ranges[0], 10) : Number.NaN;
  if (Number.isNaN(start)) {
    throw graphResponseError('upload session response is missing nextExpectedRanges');
  }
  return start;
}
