import { generateImagesSchema } from '@repo/ai';
import { MAX_COLUMNS_PER_DATASET, userUpdateSchema } from '@repo/database';
import { workflowDefinitionSchema } from '@repo/workflow';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from '../validation';

const primaryId = z.uuidv7();

// DATASET

const datasetColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.enum(['text', 'number', 'date', 'select']),
  options: z.array(z.string()).optional(),
});

const datasetColumnsSchema = z.array(datasetColumnSchema).max(MAX_COLUMNS_PER_DATASET);

const datasetRowDataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

// Client-driven view filter shared by every workspace-scoped list endpoint.
// See docs/workspaces.md: absent means "All items", never a security boundary.
// `unassigned=true` takes precedence over `workspaceId` and filters to rows
// with no workspace at all.
const workspaceIdQuerySchema = z.object({
  workspaceId: primaryId.optional(),
  unassigned: z.literal('true').optional(),
});

export const validPaginationQuery = myzValidator('query', paginationSchema);

export const validWorkspaceScopedListQuery = myzValidator(
  'query',
  paginationSchema.extend(workspaceIdQuerySchema.shape),
);

export const validWorkspaceIdQuery = myzValidator('query', workspaceIdQuerySchema);

export const validUpdateUserProfileBody = myzValidator('json', userUpdateSchema);

export const validCreateChatBody = myzValidator(
  'json',
  z.object({
    agentId: primaryId.optional(),
    workspaceId: primaryId.optional(),
  }),
);

export const validChatIdParam = myzValidator(
  'param',
  z.object({
    chatId: primaryId,
  }),
);

export const validUpdateChatTitleBody = myzValidator(
  'json',
  z.object({
    title: z.string().trim().min(1).max(255),
  }),
);

export const validUpsertAgentBody = myzValidator(
  'json',
  z.object({
    id: primaryId.nullish(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    aiModelId: primaryId,
    systemPrompt: z.string(),
    context: z.string().max(30_000).nullish(),
    tools: z.array(z.string()),
    isDefault: z.boolean().optional(),
    workspaceId: primaryId.optional(),
    defaultDatasetId: primaryId.nullish(),
    settings: z
      .object({
        temperature: z.number().min(0).max(1).nullish(),
        maxOutputTokens: z.number().int().min(1).max(64_000).nullish(),
      })
      .optional(),
  }),
);

export const validAgentIdParam = myzValidator(
  'param',
  z.object({
    agentId: primaryId,
  }),
);

export const validAgentMemoryBody = myzValidator(
  'json',
  z.object({
    content: z.string(),
  }),
);

export const validAgentDocumentParams = myzValidator(
  'param',
  z.object({
    agentId: primaryId,
    documentId: primaryId,
  }),
);

export const validRenameAgentDocumentBody = myzValidator(
  'json',
  z.object({
    name: z.string().trim().min(1).max(255),
  }),
);

export const validGenerateImagesBody = myzValidator('json', generateImagesSchema);

export const validWorkflowIdParam = myzValidator(
  'param',
  z.object({
    workflowId: primaryId,
  }),
);

export const validUpsertWorkflowBody = myzValidator(
  'json',
  z.object({
    id: primaryId.nullish(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    definition: workflowDefinitionSchema,
    workspaceId: primaryId.optional(),
  }),
);

export const validRunIdParam = myzValidator(
  'param',
  z.object({
    runId: primaryId,
  }),
);

export const validRunWorkflowBody = myzValidator(
  'json',
  z.object({
    input: z.string().optional(),
  }),
);

export const validSocialPostIdParam = myzValidator(
  'param',
  z.object({
    id: primaryId,
  }),
);

// New drafts may start empty: the user fills in content on the upsert page.
// Publish rejects empty content instead.
export const validCreateSocialPostBody = myzValidator(
  'json',
  z.object({
    content: z.string().max(3000),
    workspaceId: primaryId.optional(),
  }),
);

export const validUpdateSocialPostBody = myzValidator(
  'json',
  z.object({
    content: z.string().min(1).max(3000),
  }),
);

export const validSocialPostMediaParams = myzValidator(
  'param',
  z.object({
    id: primaryId,
    mediaId: primaryId,
  }),
);

// LinkedIn's own altText limit: max 4086 characters, recommended under 120.
export const validUpdateSocialPostMediaBody = myzValidator(
  'json',
  z.object({
    altText: z.string().max(4086),
  }),
);

export const validNotificationIdParam = myzValidator(
  'param',
  z.object({
    id: primaryId,
  }),
);

export const validWorkspaceIdParam = myzValidator(
  'param',
  z.object({
    workspaceId: primaryId,
  }),
);

const workspaceNameBodySchema = z.object({
  name: z.string().min(1).max(255),
});

export const validCreateWorkspaceBody = myzValidator('json', workspaceNameBodySchema);

export const validRenameWorkspaceBody = myzValidator('json', workspaceNameBodySchema);

export const validDatasetIdParam = myzValidator(
  'param',
  z.object({
    datasetId: primaryId,
  }),
);

export const validCreateDatasetBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    columns: datasetColumnsSchema.optional(),
    workspaceId: primaryId.optional(),
  }),
);

export const validUpdateDatasetBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).nullish(),
    columns: datasetColumnsSchema.optional(),
  }),
);

export const validDatasetRowParams = myzValidator(
  'param',
  z.object({
    datasetId: primaryId,
    rowId: primaryId,
  }),
);

export const validCreateDatasetRowBody = myzValidator(
  'json',
  z.object({
    data: datasetRowDataSchema,
  }),
);

export const validUpdateDatasetRowBody = myzValidator(
  'json',
  z.object({
    data: datasetRowDataSchema,
  }),
);
