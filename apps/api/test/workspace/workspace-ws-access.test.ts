import { config } from '@repo/config';
import { seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';
import { websocket } from '../../src/ws/socket';
import {
  deleteWorkspaceMember,
  insertWorkspace,
  insertWorkspaceMember,
  seedOrganizationWithRoles,
  type SeededUser,
} from './workspace-access-fixtures';

// An open socket must lose a restricted workspace's chat the moment the user leaves the workspace.

const idSchema = z.object({ id: z.string() });
const frameSchema = z.object({
  channel: z.string(),
  type: z.string(),
  payload: z.object({ code: z.number(), message: z.string() }).optional(),
});

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: app.fetch,
    websocket: { ...websocket, publishToSelf: true },
  });
});

afterAll(async () => {
  await server.stop(true);
});

beforeEach(async () => {
  await truncateAllTables();
});

async function postJson<T extends z.ZodType>(
  path: string,
  user: SeededUser,
  body: object,
  schema: T,
): Promise<z.infer<T>> {
  const response = await app.request(path, {
    method: 'POST',
    headers: { cookie: user.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return schema.parse(await response.json());
}

async function seedRestrictedChat() {
  const { organizationId, member } = await seedOrganizationWithRoles();
  const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
  await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'editor' });
  const { aiModelId } = await seedTokenPricedAiModel();
  const { agent } = await postJson(
    `/workspace/${workspaceId}/agent`,
    member,
    { name: 'Assistant', aiModelId, systemPrompt: 'Be helpful.' },
    z.object({ agent: idSchema }),
  );
  const { chat } = await postJson(
    `/workspace/${workspaceId}/chat`,
    member,
    { agentId: agent.id, title: 'Roadmap' },
    z.object({ chat: idSchema }),
  );
  return { member, workspaceId, chatId: chat.id };
}

function openSocket(user: SeededUser): Promise<{ socket: WebSocket; frames: unknown[] }> {
  const socket = new WebSocket(`ws://localhost:${server.port}/ws`, {
    headers: { cookie: user.cookieHeader, origin: config.appUrl },
  });
  const frames: unknown[] = [];
  socket.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data))));
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({ socket, frames }));
    socket.addEventListener('error', () => reject(new Error('socket failed to open')));
  });
}

async function nextFrame(frames: unknown[]): Promise<z.infer<typeof frameSchema>> {
  const deadline = Date.now() + 5000;
  while (frames.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return frameSchema.parse(frames.shift());
}

describe('WS chat access', () => {
  test('a user removed from a restricted workspace gets an error on the next message', async () => {
    const { member, workspaceId, chatId } = await seedRestrictedChat();
    const channel = `chat:${chatId}`;
    const { socket, frames } = await openSocket(member);

    socket.send(JSON.stringify({ channel, type: 'subscribe' }));
    expect((await nextFrame(frames)).type).toBe('subscribed');

    await deleteWorkspaceMember({ workspaceId, userId: member.userId });
    socket.send(JSON.stringify({ channel, type: 'message', payload: { message: {} } }));

    const frame = await nextFrame(frames);
    expect(frame).toEqual({
      channel,
      type: 'error',
      payload: { code: 403, message: 'Not authorized for this channel' },
    });
    socket.close();
  });

  test('a removed user cannot subscribe again', async () => {
    const { member, workspaceId, chatId } = await seedRestrictedChat();
    await deleteWorkspaceMember({ workspaceId, userId: member.userId });
    const { socket, frames } = await openSocket(member);

    socket.send(JSON.stringify({ channel: `chat:${chatId}`, type: 'subscribe' }));

    const frame = await nextFrame(frames);
    expect(frame.type).toBe('error');
    expect(frame.payload?.code).toBe(403);
    socket.close();
  });
});
