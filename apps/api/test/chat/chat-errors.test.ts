import { problemTypeUri } from '@repo/api-errors';
import { config } from '@repo/config';
import {
  languageModelStreamMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';
import { runChatStream } from '../../src/services/chat.service';
import { websocket } from '../../src/ws/socket';

const OUT_OF_CREDITS_TYPE = problemTypeUri('out-of-credits');
const ABOUT_BLANK = 'about:blank';
const PROVIDER_FAILURE_MESSAGE = 'upstream provider exploded: secret-internal-detail';

const idSchema = z.object({ id: z.string() });
const frameSchema = z.object({
  channel: z.string(),
  type: z.string(),
  payload: z
    .object({
      type: z.string(),
      status: z.number(),
      title: z.string(),
      code: z.number(),
      message: z.string(),
    })
    .optional(),
});
const errorChunkSchema = z.looseObject({ type: z.string(), errorText: z.string().optional() });

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
  resetProviderMocks();
  await truncateAllTables();
});

async function postJson<T extends z.ZodType>(
  path: string,
  cookieHeader: string,
  body: object,
  schema: T,
): Promise<z.infer<T>> {
  const response = await app.request(path, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return schema.parse(await response.json());
}

async function seedChat(balanceMicroCredits: bigint) {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const { aiModelId } = await seedTokenPricedAiModel();
  await seedCreditAccount({ userId, balanceMicroCredits });
  const { agent } = await postJson(
    `/workspace/${workspaceId}/agent`,
    cookieHeader,
    { name: 'Assistant', aiModelId, systemPrompt: 'Be helpful.' },
    z.object({ agent: idSchema }),
  );
  const { chat } = await postJson(
    `/workspace/${workspaceId}/chat`,
    cookieHeader,
    { agentId: agent.id },
    z.object({ chat: idSchema }),
  );
  return { userId, cookieHeader, chatId: chat.id };
}

function userMessage() {
  return { id: 'user-message-1', role: 'user' as const, parts: [{ type: 'text', text: 'Hello' }] };
}

function openSocket(cookieHeader: string): Promise<{ socket: WebSocket; frames: unknown[] }> {
  const socket = new WebSocket(`ws://localhost:${server.port}/ws`, {
    headers: { cookie: cookieHeader, origin: config.appUrl },
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

describe('chat WS errors', () => {
  test('a message without credits gets an out-of-credits error frame', async () => {
    const { cookieHeader, chatId } = await seedChat(0n);
    const channel = `chat:${chatId}`;
    const { socket, frames } = await openSocket(cookieHeader);

    socket.send(JSON.stringify({ channel, type: 'subscribe' }));
    expect((await nextFrame(frames)).type).toBe('subscribed');
    socket.send(JSON.stringify({ channel, type: 'message', payload: { message: userMessage() } }));

    expect(await nextFrame(frames)).toEqual({
      channel,
      type: 'error',
      payload: {
        type: OUT_OF_CREDITS_TYPE,
        status: 402,
        title: 'Out of credits',
        code: 402,
        message: 'Out of credits',
      },
    });
    socket.close();
  });

  test('a message to a chat the socket is not subscribed to gets an about:blank frame', async () => {
    const { cookieHeader, chatId } = await seedChat(5_000_000n);
    const channel = `chat:${chatId}`;
    const { socket, frames } = await openSocket(cookieHeader);

    socket.send(JSON.stringify({ channel, type: 'message', payload: { message: userMessage() } }));

    expect(await nextFrame(frames)).toEqual({
      channel,
      type: 'error',
      payload: {
        type: ABOUT_BLANK,
        status: 403,
        title: 'Forbidden',
        code: 403,
        message: 'Not subscribed to this channel',
      },
    });
    socket.close();
  });
});

describe('chat stream errors', () => {
  test('a stream failing mid-answer reports about:blank, not an i18n key or server prose', async () => {
    const { userId, chatId } = await seedChat(5_000_000n);
    languageModelStreamMock.mockImplementationOnce(() =>
      Promise.reject(new Error(PROVIDER_FAILURE_MESSAGE)),
    );

    const chunks: unknown[] = [];
    await runChatStream({ chatId, userId, message: userMessage() }, (chunk) => chunks.push(chunk));

    const errorChunk = chunks
      .map((chunk) => errorChunkSchema.parse(chunk))
      .find((chunk) => chunk.type === 'error');
    expect(errorChunk?.errorText).toBe(ABOUT_BLANK);
  });
});
