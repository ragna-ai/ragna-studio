// file: protocol.ts

import { ABOUT_BLANK } from '@repo/api-errors';
import { getReasonPhrase } from 'http-status-codes';
import * as z from 'zod';

// JSON envelope for every frame on the socket: { channel, type, payload }.
// Channel names are `<resourceType>:<resourceId>`, e.g. `chat:<chatId>`.
const clientFrameTypeSchema = z.enum(['subscribe', 'unsubscribe', 'message', 'abort']);

export const wsEnvelopeSchema = z.object({
  channel: z.string().min(1),
  type: clientFrameTypeSchema,
  payload: z.unknown().optional(),
});

export type WsEnvelope = z.infer<typeof wsEnvelopeSchema>;

// The client sends only the newest UIMessage; the server rebuilds the rest
// of the conversation from its own persisted history (chat.service.ts).
// Deep UIMessage validation happens in chat.service via safeValidateUIMessages.
export const messageFramePayloadSchema = z.object({
  // Zod treats an unknown field as optional, so a bare z.unknown() would let
  // a frame without a message through and only fail deep validation later
  // with a generic error. Rejecting missing/null here keeps the failure at
  // the protocol boundary.
  message: z.unknown().refine((value) => value != null, 'message is required'),
});

export type MessageFramePayload = z.infer<typeof messageFramePayloadSchema>;

export interface WsErrorPayload {
  type: string;
  status: number;
  title: string;
  /** Deprecated: same value as `status`. */
  code: number;
  /** Deprecated: read `title` or map `type` instead. */
  message: string;
}

/** Error payload for a protocol-level failure with no specific problem type. */
export function aboutBlankErrorPayload(status: number, message: string): WsErrorPayload {
  return { type: ABOUT_BLANK, status, title: getReasonPhrase(status), code: status, message };
}

// Frames the server sends. A discriminated union so a `chunk` frame can't be
// built without a payload, an `error` frame can't be built without a problem type, etc.
export type OutgoingWsFrame =
  | { channel: string; type: 'subscribed' }
  | { channel: string; type: 'chunk'; payload: unknown }
  | { channel: string; type: 'done' }
  | { channel: string; type: 'error'; payload: WsErrorPayload };

// Parses raw WS message data (always text for this JSON protocol) into an
// envelope, without throwing on malformed input.
export function parseWsEnvelope(data: unknown): WsEnvelope | null {
  if (typeof data !== 'string') {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }

  const result = wsEnvelopeSchema.safeParse(json);
  return result.success ? result.data : null;
}
