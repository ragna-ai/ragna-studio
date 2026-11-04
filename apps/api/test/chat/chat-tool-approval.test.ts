import {
  DRIVE_CREATED_FILE_ID,
  DRIVE_FOLDER,
  GOOGLE_DRIVE_ENDPOINTS,
  languageModelStreamMock,
  resetProviderMocks,
  scriptModelOutput,
  seedAuthenticatedUser,
  seedCreditAccount,
  seedGoogleDriveConnection,
  seedTokenPricedAiModel,
  truncateAllTables,
  vendorRequestsTo,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { runChatStream } from '../../src/services/chat.service';

const FILE_INPUT = {
  name: 'summary.md',
  folderId: DRIVE_FOLDER.id,
  format: 'markdown',
  content: '# Summary\n\nShip it.',
};

const idResponseSchema = (key: 'agent' | 'chat') =>
  z.strictObject({ [key]: z.looseObject({ id: z.string() }) });

const partSchema = z.looseObject({
  type: z.string(),
  state: z.string().optional(),
  toolCallId: z.string().optional(),
  input: z.looseObject({ name: z.string().optional() }).optional(),
  output: z.looseObject({ status: z.string() }).optional(),
  approval: z
    .looseObject({
      id: z.string(),
      approved: z.boolean().optional(),
      signature: z.string().optional(),
    })
    .optional(),
});

const messageSchema = z.looseObject({
  id: z.string(),
  role: z.string(),
  parts: z.array(partSchema),
});

const chatDetailSchema = z.strictObject({
  chat: z.looseObject({ messages: z.array(messageSchema) }),
});

const chunkSchema = z.looseObject({ type: z.string() });

interface ChatFixture {
  userId: string;
  workspaceId: string;
  cookieHeader: string;
  chatId: string;
}

async function postJson(path: string, cookieHeader: string, body: unknown): Promise<unknown> {
  const response = await app.request(path, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(StatusCodes.CREATED);
  return response.json();
}

async function seedWriterChat(): Promise<ChatFixture> {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const { aiModelId } = await seedTokenPricedAiModel();
  await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });
  await seedGoogleDriveConnection({ userId });
  const agentBody = await postJson(`/workspace/${workspaceId}/agent`, cookieHeader, {
    name: 'Writer',
    aiModelId,
    systemPrompt: 'You write files.',
    integrationTools: { 'google-drive': 'write' },
  });
  const agentId = idResponseSchema('agent').parse(agentBody).agent.id;
  const chatBody = await postJson(`/workspace/${workspaceId}/chat`, cookieHeader, { agentId });
  return {
    userId,
    workspaceId,
    cookieHeader,
    chatId: idResponseSchema('chat').parse(chatBody).chat.id,
  };
}

async function runTurn(fixture: ChatFixture, message: unknown): Promise<string[]> {
  const chunkTypes: string[] = [];
  await runChatStream({ chatId: fixture.chatId, userId: fixture.userId, message }, (chunk) =>
    chunkTypes.push(chunkSchema.parse(chunk).type),
  );
  return chunkTypes;
}

async function persistedMessages(fixture: ChatFixture) {
  const response = await app.request(`/workspace/${fixture.workspaceId}/chat/${fixture.chatId}`, {
    headers: { cookie: fixture.cookieHeader },
  });
  return chatDetailSchema.parse(await response.json()).chat.messages;
}

async function lastAssistantMessage(fixture: ChatFixture) {
  const message = (await persistedMessages(fixture)).findLast(
    (entry) => entry.role === 'assistant',
  );
  if (!message) throw new Error('No assistant message persisted');
  return message;
}

function userMessage(text: string) {
  return { id: `user-${text}`, role: 'user', parts: [{ type: 'text', text }] };
}

/** What the web client sends back: the assistant message with its approval answered. */
function answered(message: z.infer<typeof messageSchema>, approvalId: string, approved: boolean) {
  const copy = structuredClone(message);
  for (const part of copy.parts) {
    if (part.approval) {
      part.approval.id = approvalId;
      part.approval.approved = approved;
      part.state = 'approval-responded';
    }
  }
  return copy;
}

function pendingApprovalId(message: z.infer<typeof messageSchema>): string {
  const id = message.parts.find((part) => part.state === 'approval-requested')?.approval?.id;
  if (!id) throw new Error('No pending approval');
  return id;
}

/** A new chat asks the model for a title first, which takes the first scripted output. */
function scriptFirstTurn(): void {
  scriptModelOutput({ text: 'File summary' });
  scriptModelOutput({ toolCalls: [{ toolName: 'googleDriveCreateFile', input: FILE_INPUT }] });
}

async function askForFileWrite(fixture: ChatFixture): Promise<z.infer<typeof messageSchema>> {
  scriptFirstTurn();
  await runTurn(fixture, userMessage('Write the summary'));
  return lastAssistantMessage(fixture);
}

describe('chat approval of cloud drive writes', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('pauses a write for approval and uploads nothing', async () => {
    const fixture = await seedWriterChat();
    scriptFirstTurn();

    const chunkTypes = await runTurn(fixture, userMessage('Write the summary'));

    expect(chunkTypes).toContain('tool-approval-request');
    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create)).toHaveLength(0);
    const pending = (await lastAssistantMessage(fixture)).parts.find(
      (part) => part.type === 'tool-googleDriveCreateFile',
    );
    expect(pending?.state).toBe('approval-requested');
    expect(pending?.input?.name).toBe(FILE_INPUT.name);
    expect(pending?.approval?.signature).toBeString();
  });

  test('creates the file once the user approves and records the result', async () => {
    const fixture = await seedWriterChat();
    const asked = await askForFileWrite(fixture);
    scriptModelOutput({ text: 'The file is ready.' });

    await runTurn(fixture, answered(asked, pendingApprovalId(asked), true));

    const [upload] = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create);
    expect(upload?.body).toContain(FILE_INPUT.name);
    expect(upload?.body).toContain(FILE_INPUT.content);
    const done = await lastAssistantMessage(fixture);
    expect(done.id).toBe(asked.id);
    const toolPart = done.parts.find((part) => part.type === 'tool-googleDriveCreateFile');
    expect(toolPart?.state).toBe('output-available');
    expect(toolPart?.output?.status).toBe('ok');
    expect(JSON.stringify(toolPart?.output)).toContain(DRIVE_CREATED_FILE_ID);
  });

  test('writes nothing when the user denies', async () => {
    const fixture = await seedWriterChat();
    const asked = await askForFileWrite(fixture);
    scriptModelOutput({ text: 'Understood, nothing was written.' });

    await runTurn(fixture, answered(asked, pendingApprovalId(asked), false));

    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create)).toHaveLength(0);
    const toolPart = (await lastAssistantMessage(fixture)).parts.find(
      (part) => part.type === 'tool-googleDriveCreateFile',
    );
    expect(toolPart?.state).toBe('output-denied');
  });

  test('ignores an approval id the server never issued', async () => {
    const fixture = await seedWriterChat();
    const asked = await askForFileWrite(fixture);

    const attempt = runTurn(fixture, answered(asked, 'approval-never-issued', true));

    await expect(attempt).rejects.toThrow();
    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create)).toHaveLength(0);
    const toolPart = (await lastAssistantMessage(fixture)).parts.find(
      (part) => part.type === 'tool-googleDriveCreateFile',
    );
    expect(toolPart?.state).toBe('approval-requested');
  });

  test('writes what the server stored, not what the client sends back', async () => {
    const fixture = await seedWriterChat();
    const asked = await askForFileWrite(fixture);
    const tampered = answered(asked, pendingApprovalId(asked), true);
    for (const part of tampered.parts) {
      if (part.input) part.input.name = 'tampered.md';
    }
    scriptModelOutput({ text: 'Done.' });

    await runTurn(fixture, tampered);

    const [upload] = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create);
    expect(upload?.body).toContain(FILE_INPUT.name);
    expect(upload?.body).not.toContain('tampered.md');
  });

  test('treats an open approval as denied when the user sends a new message', async () => {
    const fixture = await seedWriterChat();
    const asked = await askForFileWrite(fixture);
    scriptModelOutput({ text: 'Sure, here is something else.' });

    await runTurn(fixture, userMessage('Never mind, tell me a joke'));

    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create)).toHaveLength(0);
    const messages = await persistedMessages(fixture);
    const earlier = messages.find((message) => message.id === asked.id);
    const toolPart = earlier?.parts.find((part) => part.type === 'tool-googleDriveCreateFile');
    expect(toolPart?.state).toBe('output-denied');
    const prompt = JSON.stringify(languageModelStreamMock.mock.calls.at(-1));
    expect(prompt).toContain('scripted-tool-call-0');
    expect(prompt).toContain('denied');
    expect(messages.at(-1)?.role).toBe('assistant');
    expect(JSON.stringify(messages.at(-1)?.parts)).toContain('Sure, here is something else.');
  });

  test('does not run an approval twice', async () => {
    const fixture = await seedWriterChat();
    const asked = await askForFileWrite(fixture);
    const approval = answered(asked, pendingApprovalId(asked), true);
    scriptModelOutput({ text: 'Done.' });
    await runTurn(fixture, approval);
    scriptModelOutput({ text: 'Done again.' });

    await runTurn(fixture, approval);

    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create)).toHaveLength(1);
  });
});
