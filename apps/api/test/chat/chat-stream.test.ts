import {
  seedAuthenticatedUser,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { runChatStream } from '../../src/services/chat.service';

const SCRIPTED_REPLY = 'scripted model output';

const idResponseSchema = (key: 'agent' | 'chat') =>
  z.strictObject({ [key]: z.looseObject({ id: z.string() }) });

const chatDetailSchema = z.strictObject({
  chat: z.looseObject({
    messages: z.array(
      z.looseObject({
        role: z.string(),
        parts: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })),
      }),
    ),
  }),
});

const streamedChunkSchema = z.looseObject({ type: z.string(), delta: z.string().optional() });

async function postJson(path: string, cookieHeader: string, body: unknown): Promise<unknown> {
  const response = await app.request(path, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(StatusCodes.CREATED);
  return response.json();
}

describe('chat streaming', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('streams the model reply and persists it as the assistant message', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });

    const agentBody = await postJson(`/workspace/${workspaceId}/agent`, cookieHeader, {
      name: 'Assistant',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });
    const agentId = idResponseSchema('agent').parse(agentBody).agent.id;
    const chatBody = await postJson(`/workspace/${workspaceId}/chat`, cookieHeader, { agentId });
    const chatId = idResponseSchema('chat').parse(chatBody).chat.id;

    const chunks: unknown[] = [];
    await runChatStream(
      {
        chatId,
        userId,
        message: { id: 'user-message-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      },
      (chunk) => chunks.push(chunk),
    );

    const streamedText = chunks
      .map((chunk) => streamedChunkSchema.parse(chunk))
      .filter((chunk) => chunk.type === 'text-delta')
      .map((chunk) => chunk.delta)
      .join('');
    expect(streamedText).toBe(SCRIPTED_REPLY);

    const detailResponse = await app.request(`/workspace/${workspaceId}/chat/${chatId}`, {
      headers: { cookie: cookieHeader },
    });
    const detail = chatDetailSchema.parse(await detailResponse.json());
    const assistantMessage = detail.chat.messages.find((message) => message.role === 'assistant');
    expect(assistantMessage?.parts.some((part) => part.text === SCRIPTED_REPLY)).toBe(true);
  });
});
