import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedEmailThreadWithMessage,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import {
  db,
  getChatSearchMessageSnippetsForChats,
  getDatasetRowCounts,
  listEmailMessagesByThreadIds,
} from '@repo/database';
import { agent as agentTable, chat, chatMessage } from '@repo/database/schema';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedConnectedGmailAccount } from '../email/support/email-fixtures';
import { resetEmailQueueMock } from '../email/support/email-queue.mock';

beforeEach(async () => {
  await truncateAllTables();
  resetEmailQueueMock();
  resetProviderMocks();
});

describe('listEmailMessagesByThreadIds', () => {
  test('returns messages of all given threads, oldest first per thread, with bodies', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
    const base = Date.now();
    const first = await seedEmailThreadWithMessage({
      accountId,
      providerThreadId: 't1',
      sentAt: new Date(base - 2000),
    });
    await seedEmailThreadWithMessage({
      accountId,
      providerThreadId: 't1',
      sentAt: new Date(base - 4000),
    });
    const second = await seedEmailThreadWithMessage({
      accountId,
      providerThreadId: 't2',
      sentAt: new Date(base - 1000),
    });
    await seedEmailThreadWithMessage({ accountId, providerThreadId: 't3' });

    const messages = await listEmailMessagesByThreadIds({
      threadIds: [first.thread.id, second.thread.id],
    });

    expect(messages).toHaveLength(3);
    const forFirst = messages.filter((m) => m.threadId === first.thread.id);
    expect(forFirst).toHaveLength(2);
    expect(forFirst[0]?.sentAt.getTime()).toBeLessThan(forFirst[1]?.sentAt.getTime() ?? 0);
    expect(messages.every((m) => m.body !== null)).toBe(true);
  });

  test('returns an empty list for no thread ids', async () => {
    expect(await listEmailMessagesByThreadIds({ threadIds: [] })).toEqual([]);
  });
});

describe('getDatasetRowCounts', () => {
  const nameColumn = { id: 'col-name', name: 'Name', type: 'text' as const };

  async function createDataset(cookieHeader: string, workspaceId: string) {
    const response = await app.request(`/workspace/${workspaceId}/dataset`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Leads', columns: [nameColumn] }),
    });
    const body = z.object({ dataset: z.object({ id: z.string() }) }).parse(await response.json());
    return body.dataset.id;
  }

  async function createRow(cookieHeader: string, workspaceId: string, datasetId: string) {
    const response = await app.request(`/workspace/${workspaceId}/dataset/${datasetId}/row`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ data: { [nameColumn.id]: 'x' } }),
    });
    return z.object({ row: z.object({ id: z.string() }) }).parse(await response.json()).row.id;
  }

  test('counts live rows per dataset and leaves empty datasets out', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const empty = await createDataset(cookieHeader, workspaceId);
    const two = await createDataset(cookieHeader, workspaceId);
    const withDeleted = await createDataset(cookieHeader, workspaceId);
    await createRow(cookieHeader, workspaceId, two);
    await createRow(cookieHeader, workspaceId, two);
    await createRow(cookieHeader, workspaceId, withDeleted);
    const removed = await createRow(cookieHeader, workspaceId, withDeleted);
    await app.request(`/workspace/${workspaceId}/dataset/${withDeleted}/row/${removed}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const counts = await getDatasetRowCounts({ datasetIds: [empty, two, withDeleted] });

    expect(counts.get(two)).toBe(2);
    expect(counts.get(withDeleted)).toBe(1);
    expect(counts.has(empty)).toBe(false);
  });

  test('returns an empty map for no dataset ids', async () => {
    expect((await getDatasetRowCounts({ datasetIds: [] })).size).toBe(0);
  });
});

describe('getChatSearchMessageSnippetsForChats', () => {
  async function seedChat(workspaceId: string, userId: string, agentId: string) {
    const [created] = await db
      .insert(chat)
      .values({ userId, workspaceId, agentId, title: 'Chat' })
      .returning({ id: chat.id });
    if (!created) {
      throw new Error('Failed to seed chat');
    }
    return created.id;
  }

  async function seedMessage(chatId: string, text: string, createdAt: Date) {
    const [created] = await db
      .insert(chatMessage)
      .values({ chatId, role: 'user', parts: [{ type: 'text', text }], createdAt })
      .returning({ id: chatMessage.id });
    if (!created) {
      throw new Error('Failed to seed chat message');
    }
    return created.id;
  }

  test('caps snippets per chat, newest first, and omits chats without matches', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const agentResponse = await app.request(`/workspace/${workspaceId}/agent`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'A', aiModelId, systemPrompt: 'x' }),
    });
    const { agent } = z
      .object({ agent: z.object({ id: z.string() }) })
      .parse(await agentResponse.json());
    const chatA = await seedChat(workspaceId, userId, agent.id);
    const chatB = await seedChat(workspaceId, userId, agent.id);
    const chatC = await seedChat(workspaceId, userId, agent.id);
    await seedMessage(chatA, 'needle a1', new Date('2026-01-01T10:00:00Z'));
    const a2 = await seedMessage(chatA, 'needle a2', new Date('2026-01-01T11:00:00Z'));
    const a3 = await seedMessage(chatA, 'needle a3', new Date('2026-01-01T12:00:00Z'));
    const b1 = await seedMessage(chatB, 'needle b1', new Date('2026-02-01T10:00:00Z'));
    await seedMessage(chatC, 'nothing here', new Date('2026-02-01T10:00:00Z'));

    const rows = await getChatSearchMessageSnippetsForChats({
      userId,
      chatIds: [chatA, chatB, chatC],
      query: 'needle',
      limit: 2,
      caseSensitive: false,
    });

    const idsFor = (chatId: string) =>
      rows.filter((row) => row.chatId === chatId).map((row) => row.messageId);
    expect(idsFor(chatA)).toEqual([a3, a2]);
    expect(idsFor(chatB)).toEqual([b1]);
    expect(idsFor(chatC)).toEqual([]);
    expect(rows.find((row) => row.messageId === b1)?.snippet).toBe('<mark>needle</mark> b1');
  });

  test("returns no snippets from another user's chats", async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const [agent] = await db
      .insert(agentTable)
      .values({ userId, workspaceId, aiModelId, name: 'A', systemPrompt: 'x' })
      .returning({ id: agentTable.id });
    const chatId = await seedChat(workspaceId, userId, agent?.id ?? '');
    await seedMessage(chatId, 'needle', new Date('2026-01-01T10:00:00Z'));

    const rows = await getChatSearchMessageSnippetsForChats({
      userId: other.userId,
      chatIds: [chatId],
      query: 'needle',
      limit: 2,
      caseSensitive: false,
    });

    expect(rows).toEqual([]);
  });

  test('returns an empty list for no chat ids', async () => {
    expect(
      await getChatSearchMessageSnippetsForChats({
        userId: 'nobody',
        chatIds: [],
        query: 'needle',
        limit: 2,
        caseSensitive: false,
      }),
    ).toEqual([]);
  });
});
