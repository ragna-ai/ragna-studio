import { AGENT_MARK_ICONS, AGENT_MARK_TONES } from '@repo/ai';
import { createMedia, getMediaById } from '@repo/database';
import { sweepUnreferencedMedia } from '@repo/media';
import { PROCESS_AGENT_IMAGE_JOB } from '@repo/queue';
import { toPublicMediaUrl } from '@repo/storage';
import {
  deleteObjectsMock,
  enqueuedJobs,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedTokenPricedAiModel,
  truncateAllTables,
  uploadObjectBufferMock,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// The agent mark: an icon on a tone, or an uploaded image. The resize itself
// runs in apps/worker (see its test); here the upload, validation, storage
// lifecycle and every payload that carries the mark are covered.

const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TWO_MB = 2 * 1024 * 1024;

function pngFile(name = 'mark.png'): File {
  return new File([Buffer.from(ONE_PX_PNG_BASE64, 'base64')], name, { type: 'image/png' });
}

const markFieldsSchema = {
  icon: z.string().nullable(),
  tone: z.string().nullable(),
  imageUrl: z.string().nullable(),
};

const agentIdentitySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  ...markFieldsSchema,
});
const aiModelSummarySchema = z.strictObject({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
});

const agentDetailSchema = z.looseObject({
  id: z.string(),
  imageMediaId: z.string().nullable(),
  ...markFieldsSchema,
});
const agentResponseSchema = z.object({ agent: agentDetailSchema });
const agentListResponseSchema = z.object({
  agents: z.array(z.looseObject({ id: z.string(), ...markFieldsSchema })),
});
const uploadResponseSchema = z.strictObject({ mediaId: z.string() });
const chatListResponseSchema = z.object({
  chats: z.array(
    z.looseObject({ agent: agentIdentitySchema.extend({ aiModel: aiModelSummarySchema }) }),
  ),
});
const chatDetailResponseSchema = z.object({
  chat: z.looseObject({ agent: agentIdentitySchema.extend({ aiModel: aiModelSummarySchema }) }),
});
const chatSearchResponseSchema = z.object({
  results: z.array(
    z.looseObject({ agent: agentIdentitySchema.extend({ aiModel: aiModelSummarySchema }) }),
  ),
});
const overviewResponseSchema = z.object({
  agents: z.object({ items: z.array(z.looseObject({ id: z.string(), ...markFieldsSchema })) }),
  chats: z.object({ items: z.array(z.looseObject({ agentId: z.string(), ...markFieldsSchema })) }),
});

interface Session {
  workspaceId: string;
  cookieHeader: string;
}

function jsonRequest(cookieHeader: string, method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function createAgent({ workspaceId, cookieHeader }: Session): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  const response = await app.request(
    `/workspace/${workspaceId}/agent`,
    jsonRequest(cookieHeader, 'POST', { name: 'Mark bot', aiModelId, systemPrompt: 'Be brief.' }),
  );
  return agentResponseSchema.parse(await response.json()).agent.id;
}

async function patchAgent(session: Session, agentId: string, body: unknown): Promise<Response> {
  return app.request(
    `/workspace/${session.workspaceId}/agent/${agentId}`,
    jsonRequest(session.cookieHeader, 'PATCH', body),
  );
}

async function uploadAgentImage(
  { workspaceId, cookieHeader }: Session,
  file: File = pngFile(),
): Promise<Response> {
  const formData = new FormData();
  formData.append('file', file);
  return app.request(`/workspace/${workspaceId}/agent/image-upload`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
    body: formData,
  });
}

async function uploadedMediaId(session: Session): Promise<string> {
  const response = await uploadAgentImage(session);
  return uploadResponseSchema.parse(await response.json()).mediaId;
}

async function getAgent(session: Session, agentId: string) {
  const response = await app.request(`/workspace/${session.workspaceId}/agent/${agentId}`, {
    headers: { cookie: session.cookieHeader },
  });
  return agentResponseSchema.parse(await response.json()).agent;
}

describe('agent mark lists', () => {
  test('offers 28 icons and 8 tones', () => {
    expect(AGENT_MARK_ICONS).toHaveLength(28);
    expect(AGENT_MARK_TONES).toEqual([
      'sea',
      'sage',
      'ochre',
      'clay',
      'dusk',
      'plum',
      'rose',
      'stone',
    ]);
  });

  test('accepts every offered icon and tone when saving', async () => {
    await truncateAllTables();
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);

    for (const icon of AGENT_MARK_ICONS) {
      const response = await patchAgent(session, agentId, { icon });
      expect(response.status).toBe(StatusCodes.OK);
    }
    for (const tone of AGENT_MARK_TONES) {
      const response = await patchAgent(session, agentId, { tone });
      expect(response.status).toBe(StatusCodes.OK);
    }
  });
});

describe('PATCH /workspace/:workspaceId/agent/:agentId mark fields', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('saves an icon and a tone and returns them', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);

    const response = await patchAgent(session, agentId, { icon: 'invoice-01', tone: 'plum' });

    expect(response.status).toBe(StatusCodes.OK);
    const { agent } = agentResponseSchema.parse(await response.json());
    expect(agent).toMatchObject({ icon: 'invoice-01', tone: 'plum', imageUrl: null });
    expect(await getAgent(session, agentId)).toMatchObject({ icon: 'invoice-01', tone: 'plum' });
  });

  test('starts without an icon, a tone or an image', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);

    const agent = await getAgent(session, agentId);

    expect(agent).toMatchObject({ icon: null, tone: null, imageUrl: null, imageMediaId: null });
  });

  test('clears the icon and the tone with null', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    await patchAgent(session, agentId, { icon: 'bank', tone: 'rose' });

    await patchAgent(session, agentId, { icon: null, tone: null });

    expect(await getAgent(session, agentId)).toMatchObject({ icon: null, tone: null });
  });

  test('rejects an icon that is not offered and leaves the agent unchanged', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    await patchAgent(session, agentId, { icon: 'bank', tone: 'rose' });

    const response = await patchAgent(session, agentId, { icon: 'rocket-launch' });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(await getAgent(session, agentId)).toMatchObject({ icon: 'bank', tone: 'rose' });
  });

  test('rejects an unknown tone and leaves the agent unchanged', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    await patchAgent(session, agentId, { icon: 'bank', tone: 'rose' });

    const response = await patchAgent(session, agentId, { tone: 'neon' });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(await getAgent(session, agentId)).toMatchObject({ icon: 'bank', tone: 'rose' });
  });

  test('404s an image that belongs to another workspace', async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const foreignMediaId = await uploadedMediaId(other);
    const agentId = await createAgent(owner);

    const response = await patchAgent(owner, agentId, { imageMediaId: foreignMediaId });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('404s a media row that is not an image', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const document = await createMedia({
      ownerWorkspaceId: session.workspaceId,
      bucket: 'documents',
      storageKey: `${session.workspaceId}/media/doc`,
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      size: 10,
      origin: 'uploaded',
    });

    const response = await patchAgent(session, agentId, { imageMediaId: document.id });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('POST /workspace/:workspaceId/agent/image-upload', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('stores a workspace image, queues the resize and returns its id', async () => {
    const session = await seedAuthenticatedUser();

    const response = await uploadAgentImage(session);

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = uploadResponseSchema.parse(await response.json());
    const mediaRow = await getMediaById({ id: body.mediaId });
    expect(mediaRow?.ownerWorkspaceId).toBe(session.workspaceId);
    expect(mediaRow?.mimeType).toBe('image/png');
    expect(uploadObjectBufferMock).toHaveBeenCalledTimes(1);
    expect(enqueuedJobs(PROCESS_AGENT_IMAGE_JOB).map(([, data]) => data)).toEqual([
      { mediaId: body.mediaId },
    ]);
  });

  test('accepts a JPEG', async () => {
    const session = await seedAuthenticatedUser();
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])], 'a.jpg');

    const response = await uploadAgentImage(session, jpeg);

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test('413s a file over 2 MB and stores nothing', async () => {
    const session = await seedAuthenticatedUser();
    const big = new File([new Uint8Array(TWO_MB + 1)], 'big.png', { type: 'image/png' });

    const response = await uploadAgentImage(session, big);

    expect(response.status).toBe(StatusCodes.REQUEST_TOO_LONG);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
    expect(enqueuedJobs(PROCESS_AGENT_IMAGE_JOB)).toHaveLength(0);
  });

  test('415s a WEBP image', async () => {
    const session = await seedAuthenticatedUser();
    const webp = new File(
      [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])],
      'a.webp',
      { type: 'image/webp' },
    );

    const response = await uploadAgentImage(session, webp);

    expect(response.status).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('415s a file that claims an image type but is not one', async () => {
    const session = await seedAuthenticatedUser();
    const fake = new File([new Uint8Array([1, 2, 3])], 'fake.png', { type: 'image/png' });

    const response = await uploadAgentImage(session, fake);

    expect(response.status).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('400s a request without a file', async () => {
    const session = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${session.workspaceId}/agent/image-upload`, {
      method: 'POST',
      headers: { cookie: session.cookieHeader },
      body: new FormData(),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('an agent with an image', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('returns the image url on the agent', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const mediaId = await uploadedMediaId(session);
    const mediaRow = await getMediaById({ id: mediaId });

    const response = await patchAgent(session, agentId, { imageMediaId: mediaId });

    expect(response.status).toBe(StatusCodes.OK);
    const expectedUrl = toPublicMediaUrl(mediaRow?.storageKey ?? '');
    const { agent } = agentResponseSchema.parse(await response.json());
    expect(agent).toMatchObject({ imageMediaId: mediaId, imageUrl: expectedUrl });
    expect(await getAgent(session, agentId)).toMatchObject({ imageUrl: expectedUrl });
  });

  test('keeps an image that an agent references through the media sweep', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const mediaId = await uploadedMediaId(session);
    await patchAgent(session, agentId, { imageMediaId: mediaId });

    await sweepUnreferencedMedia({ olderThanHours: 0 });

    expect(await getMediaById({ id: mediaId })).not.toBeNull();
  });

  test('deletes the stored image when it is removed', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const mediaId = await uploadedMediaId(session);
    const mediaRow = await getMediaById({ id: mediaId });
    await patchAgent(session, agentId, { imageMediaId: mediaId });
    await patchAgent(session, agentId, { icon: 'bank' });

    const response = await patchAgent(session, agentId, { imageMediaId: null });

    expect(response.status).toBe(StatusCodes.OK);
    const { agent } = agentResponseSchema.parse(await response.json());
    expect(agent).toMatchObject({ imageMediaId: null, imageUrl: null, icon: 'bank' });
    expect(await getMediaById({ id: mediaId })).toBeNull();
    expect(deleteObjectsMock).toHaveBeenCalledWith(mediaRow?.bucket, [mediaRow?.storageKey]);
  });

  test('deletes the old image when it is replaced', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const oldMediaId = await uploadedMediaId(session);
    await patchAgent(session, agentId, { imageMediaId: oldMediaId });
    const newMediaId = await uploadedMediaId(session);

    await patchAgent(session, agentId, { imageMediaId: newMediaId });

    expect(await getMediaById({ id: oldMediaId })).toBeNull();
    expect(await getMediaById({ id: newMediaId })).not.toBeNull();
  });

  test('keeps the image when the same one is saved again', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const mediaId = await uploadedMediaId(session);
    await patchAgent(session, agentId, { imageMediaId: mediaId });

    await patchAgent(session, agentId, { imageMediaId: mediaId, tone: 'sage' });

    expect(await getMediaById({ id: mediaId })).not.toBeNull();
  });

  test('deletes the stored image when the agent is deleted', async () => {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const mediaId = await uploadedMediaId(session);
    await patchAgent(session, agentId, { imageMediaId: mediaId });

    const response = await app.request(`/workspace/${session.workspaceId}/agent/${agentId}`, {
      method: 'DELETE',
      headers: { cookie: session.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(await getMediaById({ id: mediaId })).toBeNull();
  });
});

describe('every payload that carries an agent name carries its mark', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  async function seedMarkedAgentWithChat() {
    const session = await seedAuthenticatedUser();
    const agentId = await createAgent(session);
    const mediaId = await uploadedMediaId(session);
    const mediaRow = await getMediaById({ id: mediaId });
    await patchAgent(session, agentId, {
      icon: 'bank',
      tone: 'dusk',
      imageMediaId: mediaId,
    });
    const chatResponse = await app.request(
      `/workspace/${session.workspaceId}/chat`,
      jsonRequest(session.cookieHeader, 'POST', { agentId }),
    );
    const { chat } = z
      .object({ chat: z.object({ id: z.string() }) })
      .parse(await chatResponse.json());
    const expectedMark = {
      icon: 'bank',
      tone: 'dusk',
      imageUrl: toPublicMediaUrl(mediaRow?.storageKey ?? ''),
    };
    return { session, agentId, chatId: chat.id, expectedMark };
  }

  async function getJson(session: Session, path: string): Promise<unknown> {
    const response = await app.request(`/workspace/${session.workspaceId}${path}`, {
      headers: { cookie: session.cookieHeader },
    });
    expect(response.status).toBe(StatusCodes.OK);
    return response.json();
  }

  test('the agent list', async () => {
    const { session, agentId, expectedMark } = await seedMarkedAgentWithChat();

    const body = agentListResponseSchema.parse(await getJson(session, '/agent'));

    expect(body.agents.find((agent) => agent.id === agentId)).toMatchObject(expectedMark);
  });

  test('the chat list (chat history)', async () => {
    const { session, expectedMark } = await seedMarkedAgentWithChat();

    const body = chatListResponseSchema.parse(await getJson(session, '/chat'));

    expect(body.chats[0]?.agent).toMatchObject(expectedMark);
  });

  test('the chat', async () => {
    const { session, chatId, expectedMark } = await seedMarkedAgentWithChat();

    const body = chatDetailResponseSchema.parse(await getJson(session, `/chat/${chatId}`));

    expect(body.chat.agent).toMatchObject(expectedMark);
  });

  test('the chat search', async () => {
    const { session, chatId, expectedMark } = await seedMarkedAgentWithChat();
    await app.request(
      `/workspace/${session.workspaceId}/chat/${chatId}`,
      jsonRequest(session.cookieHeader, 'PATCH', { title: 'Quarterly invoices' }),
    );

    const body = chatSearchResponseSchema.parse(await getJson(session, '/chat/search?q=Quarterly'));

    expect(body.results[0]?.agent).toMatchObject(expectedMark);
  });

  test('the home overview', async () => {
    const { session, agentId, expectedMark } = await seedMarkedAgentWithChat();

    const body = overviewResponseSchema.parse(await getJson(session, '/overview'));

    expect(body.agents.items.find((agent) => agent.id === agentId)).toMatchObject(expectedMark);
    expect(body.chats.items[0]).toMatchObject({ agentId, ...expectedMark });
  });
});
