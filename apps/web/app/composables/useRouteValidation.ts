import { z } from 'zod';

const primaryIdSchema = z.uuidv7();

const chatIdSchema = z.object({
  chatId: primaryIdSchema.optional().default(''),
});

export function hasValidId(params: any) {
  const idSchema = z.object({
    id: primaryIdSchema,
  });
  const res = idSchema.safeParse(params);
  return res.success;
}

export async function hasValidChatId(params: any) {
  const res = await chatIdSchema.safeParseAsync(params);
  return res.success;
}

export function hasValidProjectId(params: any) {
  const res = z
    .object({
      projectId: primaryIdSchema,
    })
    .safeParse(params);
  return res.success;
}

export function hasValidCollectionId(params: any) {
  const res = z
    .object({
      collectionId: primaryIdSchema,
    })
    .safeParse(params);
  return res.success;
}

export function hasValidAssistantId(params: any) {
  const res = z
    .object({
      assistantId: primaryIdSchema,
    })
    .safeParse(params);
  return res.success;
}

export function hasValidWorkflowId(params: any) {
  const res = z
    .object({
      workflowId: primaryIdSchema,
    })
    .safeParse(params);
  return res.success;
}

export function hasValidDocumentId(params: any) {
  const res = z
    .object({
      documentId: primaryIdSchema,
    })
    .safeParse(params);
  return res.success;
}

export function hasValidProjectWorkflowId(params: any) {
  const res = z
    .object({
      projectId: primaryIdSchema,
      workflowId: primaryIdSchema,
    })
    .safeParse(params);
  return res.success;
}

export function hasValidProjectDocumentId(params: any) {
  const res = z
    .object({
      projectId: primaryIdSchema,
      documentId: primaryIdSchema,
    })
    .safeParse(params);
  return res.success;
}

export function hasValidPage(params: any) {
  const regexScheme = /^[1-9]\d{0,4}$/;
  const res = z
    .object({
      page: z.string().regex(regexScheme).optional().default('1'),
    })
    .safeParse(params);
  return res.success;
}
