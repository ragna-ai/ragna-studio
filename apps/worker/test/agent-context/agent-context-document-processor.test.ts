import { getAgentContextDocumentById } from '@repo/database';
import { EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB } from '@repo/queue';
import {
  downloadObjectBufferMock,
  embeddingModelEmbedMock,
  resetProviderMocks,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processAgentContextDocumentJob } from '../../src/processors/agent-context-document.processor';
import { seedAgentWithPendingDocument, seedReadyDocument } from '../support/generation-fixtures';
import { buildJob } from '../support/job';

const MAX_DOCUMENT_CHARS = 500_000;
const MAX_AGENT_TOTAL_CHARS = 5_000_000;

function scriptDownload(content: string): void {
  downloadObjectBufferMock.mockImplementationOnce(() =>
    Promise.resolve({ buffer: Buffer.from(content), contentType: 'text/plain' }),
  );
}

function runExtraction(documentId: string) {
  return processAgentContextDocumentJob(
    buildJob({ name: EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB, data: { documentId } }),
  );
}

describe('processAgentContextDocumentJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('extracts, chunks, embeds and marks the document ready', async () => {
    const { document } = await seedAgentWithPendingDocument();
    scriptDownload('Alpha paragraph.\n\nBeta paragraph.');

    const result = await runExtraction(document.id);

    const updated = await getAgentContextDocumentById({ id: document.id });
    expect(result).toEqual({ success: true });
    expect(updated?.status).toBe('ready');
    expect(updated?.extractedText).toContain('Alpha paragraph.');
    expect(updated?.isTruncated).toBe(false);
    expect(updated?.errorMessage).toBeNull();
    expect(embeddingModelEmbedMock).toHaveBeenCalledTimes(1);
  });

  test('whitespace-only text fails with the no-text error', async () => {
    const { document } = await seedAgentWithPendingDocument();
    scriptDownload('   \n\n  ');

    await runExtraction(document.id);

    const updated = await getAgentContextDocumentById({ id: document.id });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toContain('No extractable text');
    expect(embeddingModelEmbedMock).not.toHaveBeenCalled();
  });

  test('a download failure fails with the extraction error', async () => {
    const { document } = await seedAgentWithPendingDocument();
    downloadObjectBufferMock.mockImplementationOnce(() =>
      Promise.reject(new Error('storage down')),
    );

    await runExtraction(document.id);

    const updated = await getAgentContextDocumentById({ id: document.id });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toBe('Failed to extract text from the file');
  });

  test('unreadable file bytes fail with the extraction error', async () => {
    const { document } = await seedAgentWithPendingDocument({ mimeType: 'application/pdf' });
    scriptDownload('this is not a pdf');

    await runExtraction(document.id);

    const updated = await getAgentContextDocumentById({ id: document.id });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toBe('Failed to extract text from the file');
  });

  test('an embedding failure fails with the embedding error', async () => {
    const { document } = await seedAgentWithPendingDocument();
    scriptDownload('Some real text.');
    embeddingModelEmbedMock.mockImplementationOnce(() =>
      Promise.reject(new Error('embedding provider down')),
    );

    await runExtraction(document.id);

    const updated = await getAgentContextDocumentById({ id: document.id });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toBe('Failed to generate embeddings for the document');
  });

  test('text over the per-document limit is truncated and flagged', async () => {
    const { document } = await seedAgentWithPendingDocument();
    scriptDownload('y'.repeat(MAX_DOCUMENT_CHARS + 100));

    await runExtraction(document.id);

    const updated = await getAgentContextDocumentById({ id: document.id });
    expect(updated?.status).toBe('ready');
    expect(updated?.isTruncated).toBe(true);
    expect(updated?.extractedText).toHaveLength(MAX_DOCUMENT_CHARS);
  });

  test('a document that exceeds the agent budget fails with the budget error', async () => {
    const { agentId, document } = await seedAgentWithPendingDocument();
    await seedReadyDocument({ agentId, extractedTextLength: MAX_AGENT_TOTAL_CHARS - 5 });
    scriptDownload('more than five characters');

    await runExtraction(document.id);

    const updated = await getAgentContextDocumentById({ id: document.id });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toContain('agent context budget exceeded');
    expect(embeddingModelEmbedMock).not.toHaveBeenCalled();
  });

  test('a missing document completes without changes', async () => {
    const result = await runExtraction(Bun.randomUUIDv7());

    expect(result).toEqual({ success: true });
    expect(downloadObjectBufferMock).not.toHaveBeenCalled();
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    await expect(processAgentContextDocumentJob(job)).rejects.toThrow('Unknown agent document job');
  });
});
