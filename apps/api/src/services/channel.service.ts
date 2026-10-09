// file: channel.service.ts

import { auth } from '@repo/auth/server';
import { getChatByIdForUser, getWorkspaceForMember } from '@repo/database';
import { StatusCodes } from 'http-status-codes';
import type { ChatServerWebSocket } from '../ws/socket';
import type { OutgoingWsFrame } from '../ws/protocol';

type ChannelResourceType = 'chat';

type ChannelAuthorizer = (resourceId: string, userId: string) => Promise<boolean>;

// One entry per channel-type prefix (`chat:<id>`; phase 2 adds `room:<id>`).
// Each authorizer reuses the same ownership check as the matching REST
// route, so a WS subscribe can't become a side door with weaker rules.
async function canAccessChat(chatId: string, userId: string): Promise<boolean> {
  const chatRecord = await getChatByIdForUser({ chatId, userId });
  if (!chatRecord) {
    return false;
  }

  const workspaceRecord = await getWorkspaceForMember({
    workspaceId: chatRecord.workspaceId,
    userId,
  });
  return workspaceRecord !== null;
}

const channelAuthorizers: Record<ChannelResourceType, ChannelAuthorizer> = {
  chat: canAccessChat,
};

function isChannelResourceType(value: string): value is ChannelResourceType {
  return value in channelAuthorizers;
}

type ParsedChannel = { type: ChannelResourceType; resourceId: string };

function parseChannel(channel: string): ParsedChannel | null {
  const separatorIndex = channel.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  const type = channel.slice(0, separatorIndex);
  const resourceId = channel.slice(separatorIndex + 1);

  if (!resourceId || !isChannelResourceType(type)) {
    return null;
  }

  return { type, resourceId };
}

// Extracts the chatId from a channel string, but only if it's actually a
// chat channel. Used by the `message`/`abort` frame handlers, which are
// chat-specific in phase 1.
export function chatIdFromChannel(channel: string): string | null {
  const parsed = parseChannel(channel);
  return parsed?.type === 'chat' ? parsed.resourceId : null;
}

// The server authorizes every subscribe against the database; a channel
// string from the client is a request, never a grant.
export async function authorizeChannel(channel: string, userId: string): Promise<boolean> {
  const parsed = parseChannel(channel);
  if (!parsed) {
    return false;
  }

  return channelAuthorizers[parsed.type](parsed.resourceId, userId);
}

// Point-to-point: only the requesting socket needs this frame (acks, errors).
export function sendFrame(ws: ChatServerWebSocket, frame: OutgoingWsFrame): void {
  ws.send(JSON.stringify(frame));
}

// Fan-out to every subscriber of the channel's topic, including the sending
// socket itself (the server enables `publishToSelf`, see index.ts) so every
// tab watching a chat, including the one that sent the `message` frame,
// gets the chunks. Single seam all frame broadcasting goes through, so a
// later Redis bridge for multi-instance scale-out only touches this function.
export function publishFrame(ws: ChatServerWebSocket, frame: OutgoingWsFrame): void {
  ws.publish(frame.channel, JSON.stringify(frame));
}

const WS_POLICY_VIOLATION_CODE = 1008;

/**
 * Re-checks the upgrade session against better-auth. False when it is gone,
 * expired, or replaced by a different session.
 */
export async function isSocketSessionValid(
  upgradeHeaders: Headers,
  openedSessionId: string,
): Promise<boolean> {
  const current = await auth.api.getSession({ headers: upgradeHeaders });
  return current?.session.id === openedSessionId;
}

/** Sends a 401 error frame and closes the socket. */
export function closeExpiredSocket(ws: ChatServerWebSocket, channel: string): void {
  const message = 'Session expired';
  sendFrame(ws, {
    channel,
    type: 'error',
    payload: { code: StatusCodes.UNAUTHORIZED, message },
  });
  ws.close(WS_POLICY_VIOLATION_CODE, message);
}
