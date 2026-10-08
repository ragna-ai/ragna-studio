import { z } from 'zod';

export const extractAgentContextDocumentJobSchema = z.object({
  documentId: z.uuidv7(),
});

export type ExtractAgentContextDocumentJobData = z.infer<
  typeof extractAgentContextDocumentJobSchema
>;

export const EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB = 'extract-agent-context-document-job';
