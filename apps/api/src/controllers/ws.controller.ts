// file: ws.controller.ts

import { logger } from '@repo/logger';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { StatusCodes } from 'http-status-codes';
import type { AuthEnv } from '../middlewares/authMiddleware';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireAllowedOrigin } from '../middlewares/originMiddleware';
import { abortChatRun, runChatStream } from '../services/chat.service';
import {
  authorizeChannel,
  chatIdFromChannel,
  publishFrame,
  sendFrame,
} from '../services/channel.service';
import type { MessageFramePayload } from '../ws/protocol';
import { messageFramePayloadSchema, parseWsEnvelope } from '../ws/protocol';
import type { ChatServerWebSocket } from '../ws/socket';
import { upgradeWebSocket } from '../ws/socket';

function toErrorPayload(error: unknown): { code: number; message: string } {
  if (error instanceof HTTPException) {
    return { code: error.status, message: error.message };
  }

  logger.error('Unhandled error in chat WS stream', error);
  return { code: StatusCodes.INTERNAL_SERVER_ERROR, message: 'Internal Server Error' };
}

function parseMessagePayload(payload: unknown): MessageFramePayload | null {
  const result = messageFramePayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export const wsController = new Hono()
  .use(requireAllowedOrigin)
  .use(authMiddleware)
  .get(
    '/ws',
    upgradeWebSocket((c: Context<AuthEnv>) => {
      const user = c.get('user');
      const session = c.get('session');

      // Granted channels for this socket only, populated on a successful
      // `subscribe`. A topic string from the client is a request, never a
      // grant: only the server calls `raw.subscribe`.
      const grantedChannels = new Set<string>();
      let sessionExpiryTimer: ReturnType<typeof setTimeout> | undefined;

      return {
        onOpen(_event, ws) {
          // The socket is scheduled to close at session expiry; reconnect
          // re-runs full cookie auth via authMiddleware.
          const msUntilExpiry = session.expiresAt.getTime() - Date.now();
          sessionExpiryTimer = setTimeout(
            () => ws.close(1000, 'Session expired'),
            Math.max(msUntilExpiry, 0),
          );
        },

        async onMessage(event, ws) {
          // `ws.raw` comes through as `any` from Hono's singleton
          // `upgradeWebSocket` (see ws/socket.ts); assign it to Bun's real
          // ServerWebSocket type once here so everything downstream is typed.
          const raw: ChatServerWebSocket | undefined = ws.raw;
          if (!raw) {
            return;
          }

          // Raw heartbeat, deliberately outside the JSON envelope protocol
          // (see PRD "Liveness"). The web client's `useWebSocket` heartbeat
          // sends this as a plain text frame every 30s; Bun delivers text
          // frames as `string` (binary frames come through as
          // `ArrayBufferLike`, which can never equal this string). Reply
          // directly to this socket, not published to any topic, and skip
          // envelope parsing entirely so it never produces an error frame.
          if (event.data === 'ping') {
            raw.send('pong');
            return;
          }

          const envelope = parseWsEnvelope(event.data);
          if (!envelope) {
            sendFrame(raw, {
              channel: '',
              type: 'error',
              payload: { code: StatusCodes.BAD_REQUEST, message: 'Invalid frame' },
            });
            return;
          }

          const { channel, type, payload } = envelope;

          switch (type) {
            case 'subscribe': {
              // Each new subscribe re-validates the session.
              if (Date.now() >= session.expiresAt.getTime()) {
                sendFrame(raw, {
                  channel,
                  type: 'error',
                  payload: { code: StatusCodes.UNAUTHORIZED, message: 'Session expired' },
                });
                return;
              }

              const authorized = await authorizeChannel(channel, user.id);
              if (!authorized) {
                sendFrame(raw, {
                  channel,
                  type: 'error',
                  payload: {
                    code: StatusCodes.FORBIDDEN,
                    message: 'Not authorized for this channel',
                  },
                });
                return;
              }

              raw.subscribe(channel);
              grantedChannels.add(channel);
              sendFrame(raw, { channel, type: 'subscribed' });
              return;
            }

            case 'unsubscribe': {
              raw.unsubscribe(channel);
              grantedChannels.delete(channel);
              return;
            }

            case 'message': {
              if (!grantedChannels.has(channel)) {
                sendFrame(raw, {
                  channel,
                  type: 'error',
                  payload: {
                    code: StatusCodes.FORBIDDEN,
                    message: 'Not subscribed to this channel',
                  },
                });
                return;
              }

              const chatId = chatIdFromChannel(channel);
              const messagePayload = parseMessagePayload(payload);

              if (!chatId || !messagePayload) {
                sendFrame(raw, {
                  channel,
                  type: 'error',
                  payload: { code: StatusCodes.BAD_REQUEST, message: 'Invalid message payload' },
                });
                return;
              }

              try {
                await runChatStream(
                  {
                    chatId,
                    userId: user.id,
                    messages: messagePayload.messages,
                    trigger: messagePayload.trigger,
                    messageId: messagePayload.messageId,
                  },
                  (chunk) => publishFrame(raw, { channel, type: 'chunk', payload: chunk }),
                );
                publishFrame(raw, { channel, type: 'done' });
              } catch (error) {
                sendFrame(raw, { channel, type: 'error', payload: toErrorPayload(error) });
              }
              return;
            }

            case 'abort': {
              if (!grantedChannels.has(channel)) {
                return;
              }

              const chatId = chatIdFromChannel(channel);
              if (chatId) {
                abortChatRun(chatId);
              }
              return;
            }
          }
        },

        onClose() {
          clearTimeout(sessionExpiryTimer);
        },
      };
    }),
  );
