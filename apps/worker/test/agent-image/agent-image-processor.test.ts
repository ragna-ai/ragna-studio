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
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processAgentImageJob } from '../../src/processors/agent-image.processor';
import { buildJob } from '../support/job';

const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

/** A solid-colour PNG of the given size, drawn by ffmpeg so no image library is needed here. */
function drawPng({ width, height }: { width: number; height: number }): Buffer<ArrayBuffer> {
  const workDir = mkdtempSync(join(tmpdir(), 'agent-image-test-'));
  try {
    const outputPath = join(workDir, 'input.png');
    const result = spawnSync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=red:s=${width}x${height}`,
      '-frames:v',
      '1',
      outputPath,
    ]);
    expect(result.status).toBe(0);
    return Buffer.from(readFileSync(outputPath));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function pngSize(png: Uint8Array): { width: number; height: number } {
  const bytes = Buffer.from(png);
  return {
    width: bytes.readUInt32BE(PNG_WIDTH_OFFSET),
    height: bytes.readUInt32BE(PNG_HEIGHT_OFFSET),
  };
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

  test('stores a centre-cropped 80 x 80 PNG and points the same media row at it', async () => {
    const original = drawPng({ width: 200, height: 100 });
    const { workspaceId, mediaRow } = await seedUploadedImage(original);

    const result = await processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    expect(result).toEqual({ success: true });
    const uploaded = uploadObjectBufferMock.mock.calls[0]?.[0];
    expect(uploaded?.key).toBe(`${workspaceId}/images/agent-images/${mediaRow.id}.png`);
    expect(uploaded?.contentType).toBe('image/png');
    expect(pngSize(uploaded?.buffer ?? Buffer.alloc(0))).toEqual({ width: 80, height: 80 });
    const updated = await getMediaById({ id: mediaRow.id });
    expect(updated).toMatchObject({
      id: mediaRow.id,
      storageKey: uploaded?.key,
      mimeType: 'image/png',
      size: uploaded?.buffer.byteLength,
    });
  });

  test('scales a smaller square image up to 80 x 80', async () => {
    const { mediaRow } = await seedUploadedImage(drawPng({ width: 32, height: 32 }));

    await processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    const uploaded = uploadObjectBufferMock.mock.calls[0]?.[0];
    expect(pngSize(uploaded?.buffer ?? Buffer.alloc(0))).toEqual({ width: 80, height: 80 });
  });

  test('deletes the original object after the row points at the new one', async () => {
    const { mediaRow } = await seedUploadedImage(drawPng({ width: 120, height: 90 }));

    await processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    expect(deleteObjectsMock).toHaveBeenCalledWith(mediaRow.bucket, [mediaRow.storageKey]);
  });

  test('leaves a row that was already resized alone', async () => {
    const { mediaRow } = await seedUploadedImage(drawPng({ width: 120, height: 90 }));
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

  test('fails on a file ffmpeg cannot read so the job retries', async () => {
    const { mediaRow } = await seedUploadedImage(
      Buffer.from(new TextEncoder().encode('not an image')),
    );

    const run = processAgentImageJob(
      buildJob({ name: PROCESS_AGENT_IMAGE_JOB, data: { mediaId: mediaRow.id } }),
    );

    await expect(run).rejects.toThrow('ffmpeg');
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });
});
