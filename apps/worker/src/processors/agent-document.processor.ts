import type { AgentDocument } from '@repo/database';
import {
  getAgentDocumentById,
  getReadyAgentDocumentsForPrompt,
  updateAgentDocument,
} from '@repo/database';
import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import {
  AGENT_DOCUMENTS_QUEUE,
  createWorker,
  EXTRACT_AGENT_DOCUMENT_JOB,
  ExtractAgentDocumentJobDto,
} from '@repo/queue';
import { extractDocumentText } from '@repo/storage';
import { tryCatch } from '@repo/utils';

// Limits from docs/agent-context-documents.md: hard-truncate any single
// document's extracted text, and never let an agent's ready documents add up
// to more than the total budget a prompt can spend on them.
const MAX_DOCUMENT_CHARS = 100_000;
const MAX_AGENT_TOTAL_CHARS = 200_000;

const BUDGET_EXCEEDED_ERROR = 'agent context budget exceeded, remove or shrink other documents';
const NO_TEXT_FOUND_ERROR =
  'No extractable text was found in this file (it may be scanned or empty)';
const EXTRACTION_FAILED_ERROR = 'Failed to extract text from the file';

export function registerAgentDocumentJobProcessor(): Worker<any, any, string> {
  const agentDocumentWorker = createWorker({
    name: AGENT_DOCUMENTS_QUEUE,
    processor: async (job) => {
      logger.info(`Processing agent document jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case EXTRACT_AGENT_DOCUMENT_JOB: {
          const { documentId } = ExtractAgentDocumentJobDto.fromJSON(job.data);
          await extractAgentDocument(documentId);
          break;
        }
        default: {
          throw new Error(`Unknown agent document job: ${job.name}`);
        }
      }

      logger.info(`Completed agent document jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
  });

  agentDocumentWorker.on('ready', () => {
    logger.info('Agent document processor is ready and listening for jobs');
  });

  return agentDocumentWorker;
}

/**
 * Extracts a document's text and moves it to its terminal status ('ready' or
 * 'failed'). Every failure path (missing row, download error, unreadable
 * file, empty text, over-budget) is handled here and written to the row
 * rather than thrown, so a bad document never leaves the job retrying: the
 * user retries explicitly instead, via the retry route.
 */
async function extractAgentDocument(documentId: string): Promise<void> {
  const agentDocument = await getAgentDocumentById({ id: documentId });

  if (!agentDocument) {
    logger.warn(`Agent document ${documentId} not found, skipping extraction`);
    return;
  }

  const { error: extractError, data: text } = await tryCatch(() =>
    extractDocumentText({
      storageKey: agentDocument.storageKey,
      mimeType: agentDocument.mimeType,
    }),
  );

  if (extractError !== null || text === null) {
    logger.error(`Failed to extract text for agent document ${documentId}`, extractError);
    await markDocumentFailed(agentDocument, EXTRACTION_FAILED_ERROR);
    return;
  }

  if (text.trim().length === 0) {
    await markDocumentFailed(agentDocument, NO_TEXT_FOUND_ERROR);
    return;
  }

  const isTruncated = text.length > MAX_DOCUMENT_CHARS;
  const extractedText = isTruncated ? text.slice(0, MAX_DOCUMENT_CHARS) : text;

  const otherReadyDocuments = await getReadyAgentDocumentsForPrompt({
    agentId: agentDocument.agentId,
  });
  const otherReadyChars = otherReadyDocuments.reduce(
    (total, readyDocument) => total + readyDocument.extractedText.length,
    0,
  );

  // Never silently truncate to fit the budget: a document that would push
  // the agent over its total goes to 'failed' instead, so the user can
  // remove or shrink other documents and retry.
  if (otherReadyChars + extractedText.length > MAX_AGENT_TOTAL_CHARS) {
    await markDocumentFailed(agentDocument, BUDGET_EXCEEDED_ERROR);
    return;
  }

  await updateAgentDocument({
    id: agentDocument.id,
    agentId: agentDocument.agentId,
    status: 'ready',
    extractedText,
    isTruncated,
    errorMessage: null,
  });
}

async function markDocumentFailed(
  agentDocument: AgentDocument,
  errorMessage: string,
): Promise<void> {
  await updateAgentDocument({
    id: agentDocument.id,
    agentId: agentDocument.agentId,
    status: 'failed',
    errorMessage,
  });
}
