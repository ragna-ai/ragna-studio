import { createMedia, getMediaById } from '@repo/database';
import { PROCESS_AGENT_IMAGE_JOB } from '@repo/queue';
import {
  deleteObjectsMock,
  downloadObjectBufferMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
  uploadObjectBufferMock,
} from '@repo/testing';
import { createPrimaryId } from '@repo/utils';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processAgentImageJob } from '../../src/processors/agent-image.processor';
import { buildJob } from '../support/job';

/** Solid red PNGs, 200 x 100 and 32 x 32 pixels. */
const WIDE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAMAAAD0WI85AAAAA1BMVEX/AAAZ4gk3AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAKUlEQVR42u3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAPBiToQAAUDCSS0AAAAASUVORK5CYII=';
const SMALL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAA1BMVEX/AAAZ4gk3AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQ4y2NgGAWjYBSMAuwAAAQgAAFWu83mAAAAAElFTkSuQmCC';

function decodePng(base64: string): Buffer<ArrayBuffer> {
  return Buffer.from(Buffer.from(base64, 'base64'));
}

interface ImageSize {
  width: number;
  height: number;
}

/** Reads the size from the header of a lossless (VP8L) WebP: two 14-bit values minus one. */
function webpSize(webp: Uint8Array): ImageSize {
  const bytes = Buffer.from(webp);
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  expect(bytes.toString('ascii', 12, 16)).toBe('VP8L');
  const packed = bytes.readUInt32LE(21);
  return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
}

async function seedUploadedImage(original: Buffer<ArrayBuffer>) {
  const { workspaceId } = await seedAuthenticatedUser();
  const mediaRow = await createMedia({
    ownerWorkspaceId: workspaceId,
    bucket: 'images',
    storageKey: `${workspaceId}/images/chat-uploads/original`,
    filename: 'logo.png',
    mimeType: 'image/png',
    size: original.byteLength,
    origin: 'uploaded',
  });
  downloadObjectBufferMock.mockImplementation(() =>
    Promise.resolve({ buffer: original, contentType: 'image/png' }),
  );
  return { workspaceId, mediaRow };
}

describe('processAgentImageJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('stores a centre-cropped 80 x 80 WebP and points the same media row at it', async () => {
    const original = decodePng(WIDE_PNG_BASE64);
    const { workspaceId, mediaRow } = await seedUploadedImage(original);

    const result = await processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    expect(result).toEqual({ success: true });
    const uploaded = uploadObjectBufferMock.mock.calls[0]?.[0];
    expect(uploaded?.key).toBe(`${workspaceId}/images/agent-images/${mediaRow.id}.webp`);
    expect(uploaded?.contentType).toBe('image/webp');
    expect(webpSize(uploaded?.buffer ?? Buffer.alloc(0))).toEqual({ width: 80, height: 80 });
    const updated = await getMediaById({ id: mediaRow.id });
    expect(updated).toMatchObject({
      id: mediaRow.id,
      storageKey: uploaded?.key,
      mimeType: 'image/webp',
      size: uploaded?.buffer.byteLength,
    });
  });

  test('scales a smaller square image up to 80 x 80', async () => {
    const { mediaRow } = await seedUploadedImage(decodePng(SMALL_PNG_BASE64));

    await processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    const uploaded = uploadObjectBufferMock.mock.calls[0]?.[0];
    expect(webpSize(uploaded?.buffer ?? Buffer.alloc(0))).toEqual({ width: 80, height: 80 });
  });

  test('deletes the original object after the row points at the new one', async () => {
    const { mediaRow } = await seedUploadedImage(decodePng(WIDE_PNG_BASE64));

    await processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    expect(deleteObjectsMock).toHaveBeenCalledWith(mediaRow.bucket, [mediaRow.storageKey]);
  });

  test('leaves a row that was already resized alone', async () => {
    const { mediaRow } = await seedUploadedImage(decodePng(WIDE_PNG_BASE64));
    const job = buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } });
    await processAgentImageJob(job);
    uploadObjectBufferMock.mockClear();

    await processAgentImageJob(job);

    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('skips a media row that was deleted while the job waited', async () => {
    await seedAuthenticatedUser();

    const result = await processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: createPrimaryId() } }),
    );

    expect(result).toEqual({ success: true });
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('fails on a file that is not an image so the job retries', async () => {
    const { mediaRow } = await seedUploadedImage(
      Buffer.from(new TextEncoder().encode('not an image')),
    );

    const run = processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    await expect(run).rejects.toThrow();
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });
});
