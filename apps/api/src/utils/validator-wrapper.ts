// file: validator-wrapper.ts

import { validationRuleSchema, type ProblemError } from '@repo/api-errors';
import { zValidator as zv } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import * as z from 'zod';
import { ValidationException } from '../exceptions';

function toJsonPointer(path: PropertyKey[]): string {
  const segments = path.map((segment) =>
    String(segment).replaceAll('~', '~0').replaceAll('/', '~1'),
  );
  return ['#', ...segments].join('/');
}

function toProblemErrors(error: z.core.$ZodError): ProblemError[] {
  return error.issues.map((issue) => ({
    rule: validationRuleSchema.catch('custom').parse(issue.code),
    pointer: toJsonPointer(issue.path),
    detail: issue.message,
  }));
}

export const myzValidator = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zv(target, schema, (result) => {
    if (!result.success) {
      throw new ValidationException(z.prettifyError(result.error), toProblemErrors(result.error));
    }
  });
