import {
  countMediaReferences,
  createChatAttachment,
  getChatAttachmentById,
  getMediaById,
} from '@repo/database';
import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedTokenPricedAiModel,
  truncateAllTables,
  uploadObjectBufferMock,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { app } from '../../src/app';
import { MAX_FILES_PER_UPLOAD_REQUEST } from '../../src/utils/upload-limits';

// Chat attachment upload/delete (docs/media-library/prd.md,
// unified-media-prd.md). Auth/authorization for /workspace/:workspaceId/*
// in general are covered exhaustively in test/auth/ and
// test/workspace/workspace-authorization.test.ts; this file checks the
// feature's own behavior, including the media.service.ts-level "chat
// belongs to this workspace" check, which is distinct from workspaceGuard
// (that only checks the workspaceId itself). Every route goes through the
// faked storage upload/download (@repo/testing's storage-provider.mock.ts);
// extraction itself (@repo/media's extractText) is real and unmocked (pure,
// local, no network), so tier-2 text storage is exercised for real too.

// Smallest possible valid 1x1 transparent PNG (67 bytes) — a real fixture
// file rather than a mock, per docs/testing/strategy.md.
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngFile(name = 'pixel.png'): File {
  return new File([Buffer.from(ONE_PX_PNG_BASE64, 'base64')], name, { type: 'image/png' });
}

function csvFile(name = 'data.csv', content = 'name,age\nAda,36\nGrace,85\n'): File {
  return new File([content], name, { type: 'text/csv' });
}

// A real one-slide .pptx (generated with pptxgenjs), not a hand-rolled zip:
// anydoc's toMarkdownBytes parses the actual OOXML package, so the fixture
// needs to be one, per docs/testing/strategy.md's "real fixture" preference.
const PPTX_FIXTURE_PATH = join(import.meta.dir, 'fixtures', 'sample.pptx');

function pptxFile(name = 'slides.pptx'): File {
  const bytes = readFileSync(PPTX_FIXTURE_PATH);
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

const chatAttachmentSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  filename: z.string(),
  mediaType: z.string(),
  size: z.number(),
  url: z.string(),
});
const uploadResponseSchema = z.object({ attachments: z.array(chatAttachmentSchema) });

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

async function seedChat() {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const agentId = await createAgent(cookieHeader, workspaceId);
  const chatId = await createChat(cookieHeader, workspaceId, agentId);
  return { userId, workspaceId, cookieHeader, agentId, chatId };
}

async function uploadAttachments(
  cookieHeader: string,
  workspaceId: string,
  chatId: string,
  files: File[],
) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const response = await app.request(`/workspace/${workspaceId}/chat/${chatId}/attachments`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
    body: formData,
  });
  const json = await response.json();
  return {
    status: response.status,
    // A rejected upload returns the plain error envelope, not
    // `{ attachments }`, so this only parses the shape on success.
    attachments: response.ok ? uploadResponseSchema.parse(json).attachments : [],
  };
}

describe('POST /workspace/:workspaceId/chat/:chatId/attachments', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('uploads an image and returns the response DTO shape', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const file = pngFile();

    const { status, attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      file,
    ]);

    expect(status).toBe(StatusCodes.CREATED);
    expect(attachments).toHaveLength(1);
    const attachment = attachments[0];
    expect(attachment?.filename).toBe('pixel.png');
    expect(attachment?.mediaType).toBe('image/png');
    expect(attachment?.size).toBe(file.size);
    // Images resolve to the public CDN URL (@repo/storage's
    // buildChatUploadImageUrls), never the private download route.
    expect(attachment?.url).toBe(
      `https://images.ragna.io/${workspaceId}/images/chat-uploads/${attachment?.mediaId}`,
    );
    expect(uploadObjectBufferMock).toHaveBeenCalledTimes(1);
  });

  test('uploads a tier-2 document and stores its extracted text', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const file = csvFile('data.csv', 'name,age\nAda,36\nGrace,85\n');

    const { status, attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      file,
    ]);

    expect(status).toBe(StatusCodes.CREATED);
    const attachment = attachments[0];
    expect(attachment?.filename).toBe('data.csv');
    expect(attachment?.mediaType).toBe('text/csv');
    expect(attachment?.size).toBe(file.size);
    // Documents have no public URL; only the private download route.
    expect(attachment?.url).toBe(`/workspace/${workspaceId}/media/${attachment?.mediaId}/download`);

    // @repo/media's extractText runs csv through anydoc now, not a raw
    // passthrough (unified-media-prd.md, decision 3), so the stored text is
    // a GitHub-flavored markdown table rather than the original csv bytes.
    const mediaRow = await getMediaById({ id: attachment!.mediaId });
    expect(mediaRow?.extractedText).toContain('| Ada | 36 |');
    expect(mediaRow?.extractedText).toContain('| Grace | 85 |');
  });

  test('uploads a pptx and stores its extracted text (docs/media-library/unified-media-prd.md, pptx addition)', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const file = pptxFile();

    const { status, attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      file,
    ]);

    expect(status).toBe(StatusCodes.CREATED);
    const attachment = attachments[0];
    expect(attachment?.filename).toBe('slides.pptx');
    expect(attachment?.mediaType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    // Documents have no public URL; only the private download route.
    expect(attachment?.url).toBe(`/workspace/${workspaceId}/media/${attachment?.mediaId}/download`);

    const mediaRow = await getMediaById({ id: attachment!.mediaId });
    expect(mediaRow?.extractedText).toContain('Hello from a test pptx');
  });

  test('rejects a file type it cannot sniff', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'mystery.bin', {
      type: 'application/octet-stream',
    });

    const { status } = await uploadAttachments(cookieHeader, workspaceId, chatId, [file]);

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('rejects an empty file', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const file = new File([], 'empty.txt', { type: 'text/plain' });

    const { status } = await uploadAttachments(cookieHeader, workspaceId, chatId, [file]);

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('rejects a file larger than 10 MB', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([oversized], 'big.txt', { type: 'text/plain' });

    const { status } = await uploadAttachments(cookieHeader, workspaceId, chatId, [file]);

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('404s when the chat does not belong to the workspace', async () => {
    const owner = await seedChat();
    const otherUser = await seedAuthenticatedUser();

    const { status } = await uploadAttachments(
      otherUser.cookieHeader,
      otherUser.workspaceId,
      owner.chatId,
      [pngFile()],
    );

    expect(status).toBe(StatusCodes.NOT_FOUND);
  });

  test('rejects an unauthenticated request', async () => {
    const { workspaceId, chatId } = await seedChat();

    const response = await app.request(`/workspace/${workspaceId}/chat/${chatId}/attachments`, {
      method: 'POST',
      body: new FormData(),
    });

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('POST /workspace/:workspaceId/chat/:chatId/attachments (file count)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('400s more than 5 files in one request and stores nothing', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const files = Array.from({ length: MAX_FILES_PER_UPLOAD_REQUEST + 1 }, (_, index) =>
      csvFile(`data-${index}.csv`),
    );

    const { status } = await uploadAttachments(cookieHeader, workspaceId, chatId, files);

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('accepts exactly 5 files', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const files = Array.from({ length: MAX_FILES_PER_UPLOAD_REQUEST }, (_, index) =>
      csvFile(`data-${index}.csv`),
    );

    const { status, attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, files);

    expect(status).toBe(StatusCodes.CREATED);
    expect(attachments).toHaveLength(MAX_FILES_PER_UPLOAD_REQUEST);
  });
});

describe('DELETE /workspace/:workspaceId/chat/:chatId/attachments/:attachmentId', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('removes the link and deletes the media when it was the last reference', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const { attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      csvFile(),
    ]);
    const attachment = attachments[0]!;

    const response = await app.request(
      `/workspace/${workspaceId}/chat/${chatId}/attachments/${attachment.id}`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(await getChatAttachmentById({ id: attachment.id })).toBeNull();
    expect(await getMediaById({ id: attachment.mediaId })).toBeNull();
  });

  test('deletes media once its reference count is a genuine zero, not null', async () => {
    // Pins deleteMediaIfUnreferenced's `referenceCount === null` check
    // (media.service.ts): countMediaReferences legitimately
    // returns 0 once the last link is gone, and a `!referenceCount` check
    // would wrongly treat that as "count unknown" and skip the delete.
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const { attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      csvFile(),
    ]);
    const attachment = attachments[0]!;

    expect(await countMediaReferences({ mediaId: attachment.mediaId })).toBe(1);

    const response = await app.request(
      `/workspace/${workspaceId}/chat/${chatId}/attachments/${attachment.id}`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(await countMediaReferences({ mediaId: attachment.mediaId })).toBe(0);
    expect(await getMediaById({ id: attachment.mediaId })).toBeNull();
  });

  test('keeps the media row while another attachment still references it', async () => {
    const { workspaceId, cookieHeader, agentId, chatId } = await seedChat();
    const otherChatId = await createChat(cookieHeader, workspaceId, agentId);
    const { attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      csvFile(),
    ]);
    const attachment = attachments[0]!;
    // v1 has no natural flow to attach the same media to two chats; fabricate
    // a second reference directly to exercise deleteMediaIfUnreferenced's
    // "still referenced" branch (docs/media-library/prd.md, decision 2).
    await createChatAttachment({ chatId: otherChatId, mediaId: attachment.mediaId });

    const response = await app.request(
      `/workspace/${workspaceId}/chat/${chatId}/attachments/${attachment.id}`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(await getChatAttachmentById({ id: attachment.id })).toBeNull();
    expect(await getMediaById({ id: attachment.mediaId })).not.toBeNull();
  });

  test('404s for an attachment id that does not exist', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();

    const response = await app.request(
      `/workspace/${workspaceId}/chat/${chatId}/attachments/019fb2d8-0000-7000-8000-000000000000`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId/chat/:chatId (attachment cleanup)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('deletes unreferenced media when the chat is deleted', async () => {
    const { workspaceId, cookieHeader, chatId } = await seedChat();
    const { attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      csvFile(),
    ]);
    const mediaId = attachments[0]!.mediaId;

    const response = await app.request(`/workspace/${workspaceId}/chat/${chatId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(await getMediaById({ id: mediaId })).toBeNull();
  });

  test('keeps media still referenced by another chat after the chat is deleted', async () => {
    const { workspaceId, cookieHeader, agentId, chatId } = await seedChat();
    const otherChatId = await createChat(cookieHeader, workspaceId, agentId);
    const { attachments } = await uploadAttachments(cookieHeader, workspaceId, chatId, [
      csvFile(),
    ]);
    const mediaId = attachments[0]!.mediaId;
    await createChatAttachment({ chatId: otherChatId, mediaId });

    const response = await app.request(`/workspace/${workspaceId}/chat/${chatId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(await getMediaById({ id: mediaId })).not.toBeNull();
  });
});
