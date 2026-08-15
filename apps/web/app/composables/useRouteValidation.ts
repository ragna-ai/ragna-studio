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

const taskIdSchema = z.object({
  taskId: primaryIdSchema,
});

// threadId is an optional route segment (apps/web/app/pages/mail/[[threadId]].vue,
// shared by /mail and /mail/:threadId to avoid remounting the page on
// thread-open - see that file's comment), so absence is valid too.
const emailThreadIdSchema = z.object({
  threadId: primaryIdSchema.optional(),
});

const emailDraftIdSchema = z.object({
  draftId: primaryIdSchema,
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

export const hasValidTaskId = (params: any) =>
  hasValidSchema(taskIdSchema, params);

export const hasValidOptionalEmailThreadId = (params: any) =>
  hasValidSchema(emailThreadIdSchema, params);

export const hasValidEmailDraftId = (params: any) =>
  hasValidSchema(emailDraftIdSchema, params);

export function hasValidPage(params: any) {
  const regexScheme = /^[1-9]\d{0,4}$/;
  const res = z
    .object({
      page: z.string().regex(regexScheme).optional().default('1'),
    })
    .safeParse(params);
  return res.success;
}
