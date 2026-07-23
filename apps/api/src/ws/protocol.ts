// file: protocol.ts

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
  message: z.unknown(),
});

export type MessageFramePayload = z.infer<typeof messageFramePayloadSchema>;

// Frames the server sends. A discriminated union so a `chunk` frame can't be
// built without a payload, an `error` frame can't be built without a code, etc.
export type OutgoingWsFrame =
  | { channel: string; type: 'subscribed' }
  | { channel: string; type: 'chunk'; payload: unknown }
  | { channel: string; type: 'done' }
  | { channel: string; type: 'error'; payload: { code: number; message: string } };

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
