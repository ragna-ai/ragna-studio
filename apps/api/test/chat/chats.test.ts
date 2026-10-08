import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Metadata CRUD for /workspace/:workspaceId/chat.
// Streaming/WebSocket chat (runChatStream, ws.controller.ts)
// is out of scope here. Auth/authorization are covered exhaustively in
// test/auth/; this file only checks the chat feature's own behavior.

const chatSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const chatAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  aiModel: z.object({
    id: z.string(),
    provider: z.string(),
    displayName: z.string(),
  }),
});

const chatSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  agent: chatAgentSchema,
});

const chatDetailSchema = z.object({
  id: z.string(),
  agent: chatAgentSchema,
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(z.unknown()).nullable(),
});

const chatListResponseSchema = z.object({
  chats: z.array(chatSummarySchema),
  meta: z.object({ totalCount: z.number() }),
});
const chatResponseSchema = z.object({ chat: chatSchema });
const chatDetailResponseSchema = z.object({ chat: chatDetailSchema });

async function createAgent(cookieHeader: string, workspaceId: string, name = 'Assistant') {
  const { aiModelId } = await seedTokenPricedAiModel();

  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name, aiModelId, systemPrompt: 'You are a helpful assistant.' }),
  });
  const body = z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json());
  return body.agent.id;
}

async function createChat(
  cookieHeader: string,
  workspaceId: string,
  agentId: string,
  body: Record<string, unknown> = {},
) {
  const response = await app.request(`/workspace/${workspaceId}/chat`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ agentId, ...body }),
  });
  return { status: response.status, chat: chatResponseSchema.parse(await response.json()).chat };
}

describe('GET /workspace/:workspaceId/chat', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/chat`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = chatListResponseSchema.parse(await response.json());
    expect(body.chats).toEqual([]);
    expect(body.meta.totalCount).toBe(0);
  });

  test('shows a created chat, with its agent nested', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const { chat } = await createChat(cookieHeader, workspaceId, agentId);

    const response = await app.request(`/workspace/${workspaceId}/chat`, {
      headers: { cookie: cookieHeader },
    });

    const body = chatListResponseSchema.parse(await response.json());
    expect(body.chats.map((c) => c.id)).toEqual([chat.id]);
    expect(body.chats[0]?.agent.id).toBe(agentId);
  });

  test('paginates, newest first by default', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    for (let i = 0; i < 3; i++) {
      await createChat(cookieHeader, workspaceId, agentId);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const response = await app.request(`/workspace/${workspaceId}/chat?page=1&limit=2`, {
      headers: { cookie: cookieHeader },
    });
    const body = chatListResponseSchema.parse(await response.json());

    expect(body.meta.totalCount).toBe(3);
    expect(body.chats).toHaveLength(2);
  });

  test('rejects an unauthenticated request', async () => {
    const { workspaceId } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/chat`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('POST /workspace/:workspaceId/chat', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates a chat with the given agent', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);

    const { status, chat } = await createChat(cookieHeader, workspaceId, agentId);

    expect(status).toBe(StatusCodes.CREATED);
    expect(chat.workspaceId).toBe(workspaceId);
    expect(chat.agentId).toBe(agentId);
    expect(chat.title).toBe('Chat');
  });

  test('rejects an unknown agentId', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/chat`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'not-a-valid-id' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test("404s when the agentId belongs to another user's workspace", async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const agentIdB = await createAgent(userB.cookieHeader, userB.workspaceId);

    const response = await app.request(`/workspace/${userA.workspaceId}/chat`, {
      method: 'POST',
      headers: { cookie: userA.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: agentIdB }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('GET /workspace/:workspaceId/chat/:chatId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('returns the chat with its agent and no messages yet', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const { chat } = await createChat(cookieHeader, workspaceId, agentId);

    const response = await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = chatDetailResponseSchema.parse(await response.json());
    expect(body.chat.id).toBe(chat.id);
    expect(body.chat.agent.id).toBe(agentId);
    expect(body.chat.messages).toBeNull();
  });

  test('404s for a chat id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const { chat } = await createChat(cookieHeader, workspaceId, agentId);
    await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test("404s when a user requests another user's chat via their own workspace", async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const agentIdB = await createAgent(userB.cookieHeader, userB.workspaceId);
    const { chat: chatB } = await createChat(userB.cookieHeader, userB.workspaceId, agentIdB);

    const response = await app.request(`/workspace/${userA.workspaceId}/chat/${chatB.id}`, {
      headers: { cookie: userA.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PATCH /workspace/:workspaceId/chat/:chatId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('renames the chat', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const { chat } = await createChat(cookieHeader, workspaceId, agentId);

    const response = await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New title' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = chatResponseSchema.parse(await response.json());
    expect(body.chat.title).toBe('New title');
  });

  test('rejects an empty title', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const { chat } = await createChat(cookieHeader, workspaceId, agentId);

    const response = await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('404s for a chat id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const { chat } = await createChat(cookieHeader, workspaceId, agentId);
    await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New title' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId/chat/:chatId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('removes the chat from the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const { chat } = await createChat(cookieHeader, workspaceId, agentId);

    const deleteResponse = await app.request(`/workspace/${workspaceId}/chat/${chat.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/chat`, {
      headers: { cookie: cookieHeader },
    });
    const body = chatListResponseSchema.parse(await listResponse.json());
    expect(body.chats).toEqual([]);
  });
});
