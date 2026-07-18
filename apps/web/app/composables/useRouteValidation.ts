import { z } from 'zod';
import { hasValidSchema, primaryIdSchema } from '~/lib/schema';

const chatIdSchema = z.object({
  chatId: primaryIdSchema,
});

const agentIdSchema = z.object({
  agentId: primaryIdSchema,
});

const workflowIdSchema = z.object({
  workflowId: primaryIdSchema,
});

const workflowRunIdSchema = z.object({
  workflowId: primaryIdSchema,
  runId: primaryIdSchema,
});

const socialPostIdSchema = z.object({
  postId: primaryIdSchema,
});

const datasetIdSchema = z.object({
  datasetId: primaryIdSchema,
});

const documentIdSchema = z.object({
  documentId: primaryIdSchema,
});

export const hasValidChatId = (params: any) =>
  hasValidSchema(chatIdSchema, params);

export const hasValidAgentId = (params: any) =>
  hasValidSchema(agentIdSchema, params);

export const hasValidWorkflowId = (params: any) =>
  hasValidSchema(workflowIdSchema, params);

export const hasValidWorkflowRunId = (params: any) =>
  hasValidSchema(workflowRunIdSchema, params);

export const hasValidSocialPostId = (params: any) =>
  hasValidSchema(socialPostIdSchema, params);

export const hasValidDatasetId = (params: any) =>
  hasValidSchema(datasetIdSchema, params);

export const hasValidDocumentId = (params: any) =>
  hasValidSchema(documentIdSchema, params);

export function hasValidPage(params: any) {
  const regexScheme = /^[1-9]\d{0,4}$/;
  const res = z
    .object({
      page: z.string().regex(regexScheme).optional().default('1'),
    })
    .safeParse(params);
  return res.success;
}
