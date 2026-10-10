import { embedTexts } from '@repo/ai';
import { config } from '@repo/config';
import type { AgentContextDocument } from '@repo/database';
import {
  getAgentContextDocumentById,
  getReadyAgentContextDocumentsForPrompt,
  replaceAgentContextDocumentChunksAndMarkReady,
  updateAgentContextDocument,
} from '@repo/database';
import { logger } from '@repo/logger';
import { extractText, MIME_TYPE_BY_MEDIA_KIND, type MediaKind } from '@repo/media';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import {
  AGENT_CONTEXT_DOCUMENTS_QUEUE,
  createWorker,
  EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB,
  extractAgentContextDocumentJobSchema,
} from '@repo/queue';
import { downloadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { chunkText } from './agent-context-chunker';

// Limits: hard-truncate any single
// document's extracted text, and never let an agent's ready documents add up
// to more than the total storage quota a search corpus can hold.
const MAX_DOCUMENT_CHARS = 500_000;
const MAX_AGENT_TOTAL_CHARS = 5_000_000;

const BUDGET_EXCEEDED_ERROR = 'agent context budget exceeded, remove or shrink other documents';
const NO_TEXT_FOUND_ERROR =
  'No extractable text was found in this file (it may be scanned or empty)';
const EXTRACTION_FAILED_ERROR = 'Failed to extract text from the file';
const EMBEDDING_FAILED_ERROR = 'Failed to generate embeddings for the document';

// Reverse of @repo/media's MIME_TYPE_BY_MEDIA_KIND. Total over every stored
// document: the row's mimeType is always written from that same canonical
// map at upload time, so every value here is guaranteed a hit.
const MEDIA_KIND_BY_MIME_TYPE: Record<string, MediaKind> = Object.fromEntries(
  Object.entries(MIME_TYPE_BY_MEDIA_KIND).map(([kind, mimeType]) => [mimeType, kind as MediaKind]),
);

function mediaKindForMimeType(mimeType: string): MediaKind {
  const kind = MEDIA_KIND_BY_MIME_TYPE[mimeType];

  if (!kind) {
    throw new Error(`No media kind registered for mime type "${mimeType}"`);
  }

  return kind;
}

export async function processAgentContextDocumentJob(job: ProcessorJob): Promise<ProcessorSuccess> {
  logger.info(`Processing agent document jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB: {
      const { documentId } = extractAgentContextDocumentJobSchema.parse(job.data);
      await extractAgentContextDocument(documentId);
      break;
    }
    default: {
      throw new Error(`Unknown agent document job: ${job.name}`);
    }
  }

  logger.info(`Completed agent document jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}

export function registerAgentContextDocumentJobProcessor(): Worker<any, any, string> {
  const agentContextDocumentWorker = createWorker({
    name: AGENT_CONTEXT_DOCUMENTS_QUEUE,
    processor: processAgentContextDocumentJob,
  });

  agentContextDocumentWorker.on('ready', () => {
    logger.info('Agent document processor is ready and listening for jobs');
  });

  return agentContextDocumentWorker;
}

/**
 * Extracts a document's text and moves it to its terminal status ('ready' or
 * 'failed'). Every failure path (missing row, download error, unreadable
 * file, empty text, over-budget) is handled here and written to the row
 * rather than thrown, so a bad document never leaves the job retrying: the
 * user retries explicitly instead, via the retry route.
 */
async function extractAgentContextDocument(documentId: string): Promise<void> {
  const agentContextDocument = await getAgentContextDocumentById({ id: documentId });

  if (!agentContextDocument) {
    logger.warn(`Agent document ${documentId} not found, skipping extraction`);
    return;
  }

  const { error: extractError, data: text } = await tryCatch(async () => {
    const { buffer } = await downloadObjectBuffer(
      config.s3DocumentsBucketName,
      agentContextDocument.storageKey,
    );
    const kind = mediaKindForMimeType(agentContextDocument.mimeType);
    return extractText({ buffer, kind });
  });

  if (extractError !== null || text === null) {
    logger.error(`Failed to extract text for agent document ${documentId}`, extractError);
    await markDocumentFailed(agentContextDocument, EXTRACTION_FAILED_ERROR);
    return;
  }

  if (text.trim().length === 0) {
    await markDocumentFailed(agentContextDocument, NO_TEXT_FOUND_ERROR);
    return;
  }

  const isTruncated = text.length > MAX_DOCUMENT_CHARS;
  const extractedText = isTruncated ? text.slice(0, MAX_DOCUMENT_CHARS) : text;

  const otherReadyDocuments = await getReadyAgentContextDocumentsForPrompt({
    agentId: agentContextDocument.agentId,
  });
  const otherReadyChars = otherReadyDocuments.reduce(
    (total, readyDocument) => total + readyDocument.extractedText.length,
    0,
  );

  // Never silently truncate to fit the budget: a document that would push
  // the agent over its total goes to 'failed' instead, so the user can
  // remove or shrink other documents and retry.
  if (otherReadyChars + extractedText.length > MAX_AGENT_TOTAL_CHARS) {
    await markDocumentFailed(agentContextDocument, BUDGET_EXCEEDED_ERROR);
    return;
  }

  const chunks = chunkText(extractedText);

  const { error: embedError, data: embeddings } = await tryCatch(() => embedTexts(chunks));

  if (embedError !== null || embeddings === null) {
    logger.error(`Failed to generate embeddings for agent document ${documentId}`, embedError);
    await markDocumentFailed(agentContextDocument, EMBEDDING_FAILED_ERROR);
    return;
  }

  await replaceAgentContextDocumentChunksAndMarkReady({
    documentId: agentContextDocument.id,
    agentId: agentContextDocument.agentId,
    extractedText,
    isTruncated,
    chunks: chunks.map((content, chunkIndex) => ({
      chunkIndex,
      content,
      embedding: embeddings[chunkIndex],
    })),
  });
}

async function markDocumentFailed(
  agentContextDocument: AgentContextDocument,
  errorMessage: string,
): Promise<void> {
  await updateAgentContextDocument({
    id: agentContextDocument.id,
    agentId: agentContextDocument.agentId,
    status: 'failed',
    errorMessage,
  });
}
