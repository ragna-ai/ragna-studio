import * as z from 'zod';
import { ABOUT_BLANK } from './problem-type';

export const problemErrorSchema = z.object({
  rule: z.string(),
  pointer: z.string().optional(),
  detail: z.string().optional(),
});

export type ProblemError = z.infer<typeof problemErrorSchema>;

/** Unknown extension members are stripped on parse, as clients must ignore them. */
export const problemDetailsSchema = z.object({
  type: z.union([z.literal(ABOUT_BLANK), z.url()]),
  title: z.string(),
  status: z.int(),
  detail: z.string().optional(),
  errors: z.array(problemErrorSchema).optional(),
  draft: z.unknown().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
