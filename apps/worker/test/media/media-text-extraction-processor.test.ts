import { AGENT_FILE_READ_MAX_CHARACTERS } from '@repo/ai';
import { getMediaById } from '@repo/database';
import { EXTRACT_MEDIA_TEXT_JOB } from '@repo/queue';
import {
  downloadObjectBufferMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processMediaTextExtractionJob } from '../../src/processors/media-text-extraction.processor';
import { seedMedia } from '../support/media-fixtures';
import { buildJob } from '../support/job';

const ATTEMPTS = 3;

function scriptDownload(content: string): void {
  downloadObjectBufferMock.mockImplementationOnce(() =>
    Promise.resolve({ buffer: Buffer.from(content), contentType: 'text/plain' }),
  );
}

function runExtraction(mediaId: string, attemptsMade = 0) {
  return processMediaTextExtractionJob(
    buildJob({
      name: EXTRACT_MEDIA_TEXT_JOB,
      data: { mediaId },
      attempts: ATTEMPTS,
      attemptsMade,
    }),
  );
}

async function seedPendingMedia(status: 'pending' | 'ready' | 'failed' = 'pending') {
  const { workspaceId } = await seedAuthenticatedUser();
  return seedMedia({ workspaceId, textExtractionStatus: status });
}

describe('processMediaTextExtractionJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('stores the text and marks a pending row ready', async () => {
    const row = await seedPendingMedia();
    scriptDownload('Alpha paragraph.');

    const result = await runExtraction(row.id);

    const updated = await getMediaById({ id: row.id });
    expect(result).toEqual({ success: true });
    expect(updated?.textExtractionStatus).toBe('ready');
    expect(updated?.extractedText).toBe('Alpha paragraph.');
    expect(updated?.extractedTextTruncated).toBe(false);
  });

  test('cuts long text at the read limit and flags it truncated', async () => {
    const row = await seedPendingMedia();
    scriptDownload('a'.repeat(AGENT_FILE_READ_MAX_CHARACTERS + 10));

    await runExtraction(row.id);

    const updated = await getMediaById({ id: row.id });
    expect(updated?.textExtractionStatus).toBe('ready');
    expect(updated?.extractedText).toHaveLength(AGENT_FILE_READ_MAX_CHARACTERS);
    expect(updated?.extractedTextTruncated).toBe(true);
  });

  test('an empty file is still ready', async () => {
    const row = await seedPendingMedia();
    scriptDownload('');

    await runExtraction(row.id);

    const updated = await getMediaById({ id: row.id });
    expect(updated?.textExtractionStatus).toBe('ready');
    expect(updated?.extractedText).toBe('');
  });

  test('a failure before the last attempt rethrows and keeps the row pending', async () => {
    const row = await seedPendingMedia();
    downloadObjectBufferMock.mockImplementationOnce(() =>
      Promise.reject(new Error('storage down')),
    );

    await expect(runExtraction(row.id, 0)).rejects.toThrow('storage down');

    const updated = await getMediaById({ id: row.id });
    expect(updated?.textExtractionStatus).toBe('pending');
  });

  test('a failure on the last attempt marks the row failed', async () => {
    const row = await seedPendingMedia();
    downloadObjectBufferMock.mockImplementationOnce(() =>
      Promise.reject(new Error('storage down')),
    );

    await expect(runExtraction(row.id, ATTEMPTS - 1)).rejects.toThrow('storage down');

    const updated = await getMediaById({ id: row.id });
    expect(updated?.textExtractionStatus).toBe('failed');
  });

  test('skips a row that is not pending', async () => {
    const row = await seedPendingMedia('ready');

    const result = await runExtraction(row.id);

    const updated = await getMediaById({ id: row.id });
    expect(result).toEqual({ success: true });
    expect(downloadObjectBufferMock).not.toHaveBeenCalled();
    expect(updated?.extractedText).toBeNull();
  });
});
