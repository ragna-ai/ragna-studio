import { db } from '@repo/database';
import { chatMessage } from '@repo/database/schema';
import {
  seedAuthenticatedUser,
  seedOrganizationMember,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { authorizeChannel } from '../../src/services/channel.service';

// Chats are private to their author, even inside a shared workspace.

const idSchema = z.object({ id: z.string() });
const chatListSchema = z.object({
  chats: z.array(idSchema.loose()),
  meta: z.strictObject({ totalCount: z.number() }),
});
const searchSchema = z.object({
  results: z.array(idSchema.loose()),
  totalCount: z.number(),
});
const overviewChatsSchema = z.object({
  chats: z.object({ items: z.array(idSchema.loose()), total: z.number() }).loose(),
});

interface Colleagues {
  owner: Awaited<ReturnType<typeof seedAuthenticatedUser>>;
  colleague: Awaited<ReturnType<typeof seedAuthenticatedUser>>;
  chatId: string;
}

async function seedOwnerChatWithColleague(): Promise<Colleagues> {
  const owner = await seedAuthenticatedUser();
  const membership = await db.query.member.findFirst({ where: { userId: owner.userId } });
  const colleague = await seedOrganizationMember({
    organizationId: membership?.organizationId ?? '',
    role: 'member',
  });

  const { aiModelId } = await seedTokenPricedAiModel();
  const agentResponse = await app.request(`/workspace/${owner.workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: owner.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Assistant', aiModelId, systemPrompt: 'Be helpful.' }),
  });
  const { agent } = z.object({ agent: idSchema }).parse(await agentResponse.json());

  const chatResponse = await app.request(`/workspace/${owner.workspaceId}/chat`, {
    method: 'POST',
    headers: { cookie: owner.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: agent.id, title: 'Secret plans' }),
  });
  const { chat } = z.object({ chat: idSchema }).parse(await chatResponse.json());

  await app.request(`/workspace/${owner.workspaceId}/chat/${chat.id}`, {
    method: 'PATCH',
    headers: { cookie: owner.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Secret plans' }),
  });
  const [message] = await db
    .insert(chatMessage)
    .values({ chatId: chat.id, role: 'user', parts: [{ type: 'text', text: 'hidden needle' }] })
    .returning({ id: chatMessage.id });

  expect(message).toBeDefined();
  return { owner, colleague, chatId: chat.id };
}

function request(user: { cookieHeader: string; workspaceId: string }, path: string, init = {}) {
  return app.request(`/workspace/${user.workspaceId}${path}`, {
    ...init,
    headers: { cookie: user.cookieHeader, 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('chat privacy between workspace members', () => {
  test('the author sees the chat, the colleague does not see it in the list', async () => {
    const { owner, colleague, chatId } = await seedOwnerChatWithColleague();

    const ownerList = chatListSchema.parse(await (await request(owner, '/chat')).json());
    const colleagueList = chatListSchema.parse(await (await request(colleague, '/chat')).json());

    expect(ownerList.chats.map((c) => c.id)).toEqual([chatId]);
    expect(colleagueList.chats).toEqual([]);
    expect(colleagueList.meta.totalCount).toBe(0);
  });

  test("404s when a colleague fetches the author's chat", async () => {
    const { colleague, chatId } = await seedOwnerChatWithColleague();

    const response = await request(colleague, `/chat/${chatId}`);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test("404s when a colleague renames the author's chat", async () => {
    const { colleague, chatId } = await seedOwnerChatWithColleague();

    const response = await request(colleague, `/chat/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Hijacked' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const stored = await db.query.chat.findFirst({ where: { id: chatId } });
    expect(stored?.title).toBe('Secret plans');
  });

  test("404s when a colleague deletes the author's chat, which survives", async () => {
    const { colleague, chatId } = await seedOwnerChatWithColleague();

    const response = await request(colleague, `/chat/${chatId}`, { method: 'DELETE' });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await db.query.chat.findFirst({ where: { id: chatId } })).toBeDefined();
  });

  test("404s when a colleague branches the author's chat", async () => {
    const { colleague, chatId } = await seedOwnerChatWithColleague();
    const message = await db.query.chatMessage.findFirst({ where: { chatId } });

    const response = await request(colleague, `/chat/${chatId}/branch`, {
      method: 'POST',
      body: JSON.stringify({ messageId: message?.id }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test("hides the author's chat from a colleague's search, by title and by content", async () => {
    const { owner, colleague } = await seedOwnerChatWithColleague();

    const byTitle = searchSchema.parse(
      await (await request(colleague, '/chat/search?q=Secret')).json(),
    );
    const byContent = searchSchema.parse(
      await (await request(colleague, '/chat/search?q=needle')).json(),
    );
    const ownerContent = searchSchema.parse(
      await (await request(owner, '/chat/search?q=needle')).json(),
    );

    expect(byTitle.totalCount).toBe(0);
    expect(byContent.results).toEqual([]);
    expect(ownerContent.results).toHaveLength(1);
  });

  test("keeps the author's chat out of a colleague's overview", async () => {
    const { owner, colleague } = await seedOwnerChatWithColleague();

    const ownerOverview = overviewChatsSchema.parse(
      await (await request(owner, '/overview')).json(),
    );
    const colleagueOverview = overviewChatsSchema.parse(
      await (await request(colleague, '/overview')).json(),
    );

    expect(ownerOverview.chats.total).toBe(1);
    expect(colleagueOverview.chats.total).toBe(0);
    expect(colleagueOverview.chats.items).toEqual([]);
  });

  test("404s when a colleague uploads to or removes from the author's chat attachments", async () => {
    const { colleague, chatId } = await seedOwnerChatWithColleague();
    const formData = new FormData();
    formData.append('files', new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' }));

    const upload = await app.request(
      `/workspace/${colleague.workspaceId}/chat/${chatId}/attachments`,
      {
        method: 'POST',
        headers: { cookie: colleague.cookieHeader },
        body: formData,
      },
    );
    const remove = await request(colleague, `/chat/${chatId}/attachments/${Bun.randomUUIDv7()}`, {
      method: 'DELETE',
    });

    expect(upload.status).toBe(StatusCodes.NOT_FOUND);
    expect(remove.status).toBe(StatusCodes.NOT_FOUND);
  });

  test("refuses a colleague's websocket subscription to the author's chat", async () => {
    const { owner, colleague, chatId } = await seedOwnerChatWithColleague();

    expect(await authorizeChannel(`chat:${chatId}`, owner.userId)).toBe(true);
    expect(await authorizeChannel(`chat:${chatId}`, colleague.userId)).toBe(false);
  });
});
