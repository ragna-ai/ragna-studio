import {
  countMediaReferences,
  createChatAttachment,
  createChatMessages,
  createMedia,
} from '@repo/database';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// "Branch from here" (specs/chat/branching.md): copies a chat's messages up
// to and including a given message into a brand new, independent chat.
// Auth/authorization for /workspace/:workspaceId/* in general are covered
// exhaustively in test/auth/; this file checks the branch endpoint's own
// copy behavior.

const branchedChatSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  title: z.string(),
  forkedFromChatId: z.string().nullable(),
  forkedFromMessageId: z.string().nullable(),
});
const branchResponseSchema = z.object({ chat: branchedChatSchema });

const chatMessageSchema = z.object({ id: z.string(), role: z.string() });
const chatDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(chatMessageSchema).nullable(),
});
const chatDetailResponseSchema = z.object({ chat: chatDetailSchema });

const chatHistorySchema = z.object({
  chats: z.array(
    z.object({
      id: z.string(),
      forkedFrom: z.object({ chatId: z.string(), title: z.string() }).nullable(),
    }),
  ),
});

async function createAgent(cookieHeader: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();

  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Assistant', aiModelId, systemPrompt: 'You are helpful.' }),
  });
  const body = z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json());
  return body.agent.id;
}

async function createChat(
  cookieHeader: string,
  workspaceId: string,
  agentId: string,
): Promise<string> {
  const response = await app.request(`/workspace/${workspaceId}/chat`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
  const body = z.object({ chat: z.object({ id: z.string() }) }).parse(await response.json());
  return body.chat.id;
}

// runChatStream (the streaming pipeline) is the only current write path for
// chat_messages and needs a live/mocked AI provider, out of scope here (same
// as chats.test.ts). Branching doesn't need real streaming to test the copy
// logic, so messages are seeded directly, one call per message so each gets
// its own createdAt for a stable, testable ordering.
async function seedMessage(chatId: string, role: 'user' | 'assistant', text: string) {
  const [message] = await createChatMessages([
    { chatId, role, parts: [{ type: 'text', text }] },
  ]);
  if (!message) throw new Error('Failed to seed chat message');
  await new Promise((resolve) => setTimeout(resolve, 10));
  return message;
}

async function getChatDetail(cookieHeader: string, workspaceId: string, chatId: string) {
  const response = await app.request(`/workspace/${workspaceId}/chat/${chatId}`, {
    headers: { cookie: cookieHeader },
  });
  return chatDetailResponseSchema.parse(await response.json());
}

async function branchChat(
  cookieHeader: string,
  workspaceId: string,
  chatId: string,
  messageId: string,
) {
  const response = await app.request(`/workspace/${workspaceId}/chat/${chatId}/branch`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
  return { status: response.status, body: await response.json() };
}

describe('POST /workspace/:workspaceId/chat/:chatId/branch', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('branching from the last message copies every message, in order, with new ids', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    const first = await seedMessage(chatId, 'user', 'Hello');
    const second = await seedMessage(chatId, 'assistant', 'Hi there');

    const { status, body } = await branchChat(cookieHeader, workspaceId, chatId, second.id);

    expect(status).toBe(StatusCodes.CREATED);
    const { chat: branchedChat } = branchResponseSchema.parse(body);
    expect(branchedChat.forkedFromChatId).toBe(chatId);
    expect(branchedChat.forkedFromMessageId).toBe(second.id);
    expect(branchedChat.title).toBe('Chat (branch)');

    const branchDetail = await getChatDetail(cookieHeader, workspaceId, branchedChat.id);
    const branchedIds = (branchDetail.chat.messages ?? []).map((m) => m.id);
    expect(branchedIds).toHaveLength(2);
    expect(branchedIds).not.toContain(first.id);
    expect(branchedIds).not.toContain(second.id);
  });

  test('branching from a middle message excludes later messages', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    const first = await seedMessage(chatId, 'user', 'Hello');
    await seedMessage(chatId, 'assistant', 'Hi there');
    await seedMessage(chatId, 'user', 'A follow-up, after the cutoff');

    const { chat: branchedChat } = branchResponseSchema.parse(
      (await branchChat(cookieHeader, workspaceId, chatId, first.id)).body,
    );

    const branchDetail = await getChatDetail(cookieHeader, workspaceId, branchedChat.id);
    expect(branchDetail.chat.messages).toHaveLength(1);
    expect(branchDetail.chat.messages?.[0]?.role).toBe('user');
  });

  test('leaves the source chat unchanged', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    const first = await seedMessage(chatId, 'user', 'Hello');
    const second = await seedMessage(chatId, 'assistant', 'Hi there');

    await branchChat(cookieHeader, workspaceId, chatId, second.id);

    const sourceDetail = await getChatDetail(cookieHeader, workspaceId, chatId);
    expect(sourceDetail.chat.title).toBe('Chat');
    expect((sourceDetail.chat.messages ?? []).map((m) => m.id)).toEqual([first.id, second.id]);
  });

  test('duplicates chat_attachments for copied messages onto the new chat', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    const media = await createMedia({
      ownerWorkspaceId: workspaceId,
      bucket: 'test-bucket',
      storageKey: 'test-key.png',
      filename: 'pixel.png',
      mimeType: 'image/png',
      size: 67,
      origin: 'uploaded',
    });
    await createChatAttachment({ chatId, mediaId: media.id });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const message = await seedMessage(chatId, 'user', 'Here is a file');

    expect(await countMediaReferences({ mediaId: media.id })).toBe(1);

    const { chat: branchedChat } = branchResponseSchema.parse(
      (await branchChat(cookieHeader, workspaceId, chatId, message.id)).body,
    );

    expect(await countMediaReferences({ mediaId: media.id })).toBe(2);
    expect(branchedChat.workspaceId).toBe(workspaceId);
  });

  test('404s for a chatId that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    const message = await seedMessage(chatId, 'user', 'Hello');
    await app.request(`/workspace/${workspaceId}/chat/${chatId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const { status } = await branchChat(cookieHeader, workspaceId, chatId, message.id);

    expect(status).toBe(StatusCodes.NOT_FOUND);
  });

  test('404s for a messageId that belongs to a different chat', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    const otherChatId = await createChat(cookieHeader, workspaceId, agentId);
    const otherMessage = await seedMessage(otherChatId, 'user', 'From another chat');

    const { status } = await branchChat(cookieHeader, workspaceId, chatId, otherMessage.id);

    expect(status).toBe(StatusCodes.NOT_FOUND);
  });

  test("404s when a user branches another user's chat via their own workspace", async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const agentIdB = await createAgent(userB.cookieHeader, userB.workspaceId);
    const chatIdB = await createChat(userB.cookieHeader, userB.workspaceId, agentIdB);
    const messageB = await seedMessage(chatIdB, 'user', 'Hello');

    const { status } = await branchChat(
      userA.cookieHeader,
      userA.workspaceId,
      chatIdB,
      messageB.id,
    );

    expect(status).toBe(StatusCodes.NOT_FOUND);
  });

  test('the chat list marks a branched chat with its source', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    const message = await seedMessage(chatId, 'user', 'Hello');
    const { chat: branchedChat } = branchResponseSchema.parse(
      (await branchChat(cookieHeader, workspaceId, chatId, message.id)).body,
    );

    const response = await app.request(`/workspace/${workspaceId}/chat`, {
      headers: { cookie: cookieHeader },
    });
    const body = chatHistorySchema.parse(await response.json());

    const listedBranch = body.chats.find((c) => c.id === branchedChat.id);
    expect(listedBranch?.forkedFrom).toEqual({ chatId, title: 'Chat' });
    const listedSource = body.chats.find((c) => c.id === chatId);
    expect(listedSource?.forkedFrom).toBeNull();
  });
});
