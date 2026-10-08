// file: validator-wrapper.ts

import { zValidator as zv } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import * as z from 'zod';
import { UnprocessableEntityException } from '../exceptions';

export const myzValidator = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      const message = z.prettifyError(result.error);
      throw new UnprocessableEntityException(message);
    }
  });
