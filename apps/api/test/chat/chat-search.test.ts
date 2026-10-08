import { db } from '@repo/database';
import { chatMessage } from '@repo/database/schema';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// GET /workspace/:workspaceId/chat/search. Messages are seeded straight into
// the table because no route creates them outside the streaming path.

const searchResponseSchema = z.strictObject({
  results: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      titleMatched: z.boolean(),
      updatedAt: z.string(),
      agent: z.strictObject({
        id: z.string(),
        name: z.string(),
        aiModel: z.strictObject({
          id: z.string(),
          provider: z.string(),
          displayName: z.string(),
        }),
      }),
      messageSnippets: z.array(z.strictObject({ messageId: z.string(), snippet: z.string() })),
    }),
  ),
  totalCount: z.number(),
});

const createdChatSchema = z.object({ chat: z.object({ id: z.string() }) });

beforeEach(async () => {
  await truncateAllTables();
});

async function createAgent(cookieHeader: string, workspaceId: string) {
  const { aiModelId } = await seedTokenPricedAiModel();
  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Assistant', aiModelId, systemPrompt: 'Be helpful.' }),
  });
  const body = z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json());
  return body.agent.id;
}

async function createChat(cookieHeader: string, workspaceId: string, agentId: string) {
  const response = await app.request(`/workspace/${workspaceId}/chat`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
  return createdChatSchema.parse(await response.json()).chat.id;
}

async function renameChat(
  cookieHeader: string,
  workspaceId: string,
  chatId: string,
  title: string,
) {
  await app.request(`/workspace/${workspaceId}/chat/${chatId}`, {
    method: 'PATCH',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

async function seedMessage(chatId: string, parts: unknown[], createdAt: Date) {
  const [message] = await db
    .insert(chatMessage)
    .values({ chatId, role: 'user', parts, createdAt })
    .returning({ id: chatMessage.id });
  if (!message) {
    throw new Error('Failed to seed chat message');
  }
  return message.id;
}

function seedTextMessage(chatId: string, text: string, createdAt: Date) {
  return seedMessage(chatId, [{ type: 'text', text }], createdAt);
}

async function search(cookieHeader: string, workspaceId: string, query: string) {
  const response = await app.request(`/workspace/${workspaceId}/chat/search?${query}`, {
    headers: { cookie: cookieHeader },
  });
  expect(response.status).toBe(StatusCodes.OK);
  return searchResponseSchema.parse(await response.json());
}

describe('GET /workspace/:workspaceId/chat/search', () => {
  test('returns up to snippetsPerChat snippets per chat, newest first', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatA = await createChat(cookieHeader, workspaceId, agentId);
    const chatB = await createChat(cookieHeader, workspaceId, agentId);
    await seedTextMessage(chatA, 'alpha needle one', new Date('2026-01-01T10:00:00Z'));
    const a2 = await seedTextMessage(chatA, 'alpha needle two', new Date('2026-01-01T11:00:00Z'));
    const a3 = await seedTextMessage(chatA, 'alpha needle three', new Date('2026-01-01T12:00:00Z'));
    const b1 = await seedTextMessage(chatB, 'beta needle one', new Date('2026-02-01T10:00:00Z'));
    const b2 = await seedTextMessage(chatB, 'beta needle two', new Date('2026-02-01T11:00:00Z'));
    await seedTextMessage(chatB, 'unrelated text', new Date('2026-02-01T12:00:00Z'));

    const body = await search(cookieHeader, workspaceId, 'q=needle&snippetsPerChat=2');

    expect(body.totalCount).toBe(2);
    const byChat = new Map(body.results.map((result) => [result.id, result]));
    expect(byChat.get(chatA)?.messageSnippets.map((s) => s.messageId)).toEqual([a3, a2]);
    expect(byChat.get(chatB)?.messageSnippets.map((s) => s.messageId)).toEqual([b2, b1]);
    expect(byChat.get(chatA)?.messageSnippets[0]?.snippet).toBe('alpha <mark>needle</mark> three');
    expect(byChat.get(chatA)?.titleMatched).toBe(false);
  });

  test('a message with several matching text parts contributes one snippet', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    await seedMessage(
      chatId,
      [
        { type: 'text', text: 'first needle' },
        { type: 'reasoning', text: 'hidden needle' },
        { type: 'text', text: 'second needle' },
      ],
      new Date('2026-01-01T10:00:00Z'),
    );

    const body = await search(cookieHeader, workspaceId, 'q=needle');

    expect(body.results[0]?.messageSnippets).toHaveLength(1);
  });

  test('case sensitivity flag controls message matching', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const chatId = await createChat(cookieHeader, workspaceId, agentId);
    await seedTextMessage(chatId, 'Needle in caps', new Date('2026-01-01T10:00:00Z'));

    const insensitive = await search(cookieHeader, workspaceId, 'q=needle');
    const sensitive = await search(cookieHeader, workspaceId, 'q=needle&caseSensitive=true');

    expect(insensitive.results.map((r) => r.id)).toEqual([chatId]);
    expect(insensitive.results[0]?.messageSnippets).toHaveLength(1);
    expect(sensitive.results).toEqual([]);
    expect(sensitive.totalCount).toBe(0);
  });

  test('a chat matched by title only has no snippets', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const titleOnly = await createChat(cookieHeader, workspaceId, agentId);
    const withMessage = await createChat(cookieHeader, workspaceId, agentId);
    await renameChat(cookieHeader, workspaceId, titleOnly, 'Quarterly needle review');
    await seedTextMessage(withMessage, 'a needle here', new Date('2026-01-01T10:00:00Z'));

    const body = await search(cookieHeader, workspaceId, 'q=needle');

    const byChat = new Map(body.results.map((result) => [result.id, result]));
    expect(byChat.get(titleOnly)?.titleMatched).toBe(true);
    expect(byChat.get(titleOnly)?.messageSnippets).toEqual([]);
    expect(byChat.get(withMessage)?.messageSnippets).toHaveLength(1);
  });

  test('does not return chats from another workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const otherAgent = await createAgent(other.cookieHeader, other.workspaceId);
    const otherChat = await createChat(other.cookieHeader, other.workspaceId, otherAgent);
    await seedTextMessage(otherChat, 'needle elsewhere', new Date('2026-01-01T10:00:00Z'));

    const body = await search(cookieHeader, workspaceId, 'q=needle');

    expect(body.results).toEqual([]);
  });
});
