import { workflowDefinitionSchema } from '@repo/workflow';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validWorkflowIdParam = myzValidator(
  'param',
  z.object({
    workflowId: primaryId,
  }),
);

export const validWorkflowRunIdParam = myzValidator(
  'param',
  z.object({
    workflowId: primaryId,
    runId: primaryId,
  }),
);

export const validCreateWorkflowBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    definition: workflowDefinitionSchema,
  }),
);

export const validUpdateWorkflowBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    definition: workflowDefinitionSchema.optional(),
  }),
);

export const validRunWorkflowBody = myzValidator(
  'json',
  z.object({
    input: z.string().optional(),
  }),
);
