import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

// 3 or 6 digit hex color, e.g. #f00 or #ff0000 (docs/tasks/prd.md: "color,
// not null, hex string").
const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a hex string, e.g. #4287f5');

export const validTaskLabelIdParam = myzValidator(
  'param',
  z.object({
    taskLabelId: primaryId,
  }),
);

export const validCreateTaskLabelBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255),
    color: hexColor,
  }),
);

export const validUpdateTaskLabelBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255).optional(),
    color: hexColor.optional(),
  }),
);
