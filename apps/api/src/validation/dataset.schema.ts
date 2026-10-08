import { MAX_COLUMNS_PER_DATASET } from '@repo/database';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

const datasetColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.enum(['text', 'number', 'date', 'select']),
  options: z.array(z.string()).optional(),
});

const datasetColumnsSchema = z.array(datasetColumnSchema).max(MAX_COLUMNS_PER_DATASET);

const datasetRowDataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export const validDatasetIdParam = myzValidator(
  'param',
  z.object({
    datasetId: primaryId,
  }),
);

export const validDatasetRowIdParam = myzValidator(
  'param',
  z.object({
    datasetId: primaryId,
    rowId: primaryId,
  }),
);

// workspaceId is not part of the body: it comes from the route path and is
// resolved by the workspace guard.
export const validCreateDatasetBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    columns: datasetColumnsSchema.optional(),
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

// Omitted = top of the dataset (mirrors validMoveTaskBody).
export const validMoveDatasetRowBody = myzValidator(
  'json',
  z.object({
    afterRowId: primaryId.nullish(),
  }),
);

export const validDatasetExportQuery = myzValidator(
  'query',
  z.object({
    format: z.enum(['csv', 'xlsx', 'pdf', 'md']),
  }),
);
