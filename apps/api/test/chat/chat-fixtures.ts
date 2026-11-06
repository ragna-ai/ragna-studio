import { db, sql } from '@repo/database';
import { chat } from '@repo/database/schema';
import { seedCreditAccount, seedTokenPricedAiModel } from '@repo/testing';
import * as z from 'zod';
import { app } from '../../src/app';
import { runChatStream } from '../../src/services/chat.service';

const OLDER_CHAT_DATE = new Date('2020-01-01T00:00:00Z');
const NEWER_CHAT_DATE = new Date('2021-01-01T00:00:00Z');

const idResponseSchema = (key: 'agent' | 'chat') =>
  z.strictObject({ [key]: z.looseObject({ id: z.string() }) }).transform((body) => body[key].id);

export interface SeededChatPair {
  userId: string;
  workspaceId: string;
  cookieHeader: string;
  olderChatId: string;
  newerChatId: string;
}

interface AuthenticatedUser {
  userId: string;
  workspaceId: string;
  cookieHeader: string;
}

async function postJson(path: string, cookieHeader: string, body: unknown): Promise<unknown> {
  const response = await app.request(path, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function backdateChat(chatId: string, date: Date): Promise<void> {
  await db
    .update(chat)
    .set({ createdAt: date, updatedAt: date, lastMessageAt: date })
    .where(sql`${chat.id} = ${chatId}`);
}

/** Two chats of one agent: the older one was created and last active in 2020, the newer in 2021. */
export async function seedOlderAndNewerChat(user: AuthenticatedUser): Promise<SeededChatPair> {
  const { userId, workspaceId, cookieHeader } = user;
  const { aiModelId } = await seedTokenPricedAiModel();
  await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });

  const agentBody = await postJson(`/workspace/${workspaceId}/agent`, cookieHeader, {
    name: 'Assistant',
    aiModelId,
    systemPrompt: 'You are helpful.',
  });
  const agentId = idResponseSchema('agent').parse(agentBody);

  const olderChatId = idResponseSchema('chat').parse(
    await postJson(`/workspace/${workspaceId}/chat`, cookieHeader, { agentId }),
  );
  const newerChatId = idResponseSchema('chat').parse(
    await postJson(`/workspace/${workspaceId}/chat`, cookieHeader, { agentId }),
  );
  await backdateChat(olderChatId, OLDER_CHAT_DATE);
  await backdateChat(newerChatId, NEWER_CHAT_DATE);

  return { userId, workspaceId, cookieHeader, olderChatId, newerChatId };
}

/** Sends one user message through the real chat stream, which also saves the model reply. */
export async function sendChatMessage(chatId: string, userId: string): Promise<void> {
  await runChatStream(
    {
      chatId,
      userId,
      message: { id: `message-${chatId}`, role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    },
    () => {},
  );
}
