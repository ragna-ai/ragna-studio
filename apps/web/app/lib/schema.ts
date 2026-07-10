import { z } from 'zod';

export const primaryIdSchema = z.uuidv7();

export function hasValidSchema(schema: z.ZodTypeAny, params: any) {
  const res = schema.safeParse(params);
  return res.success;
}

export async function hasValidSchemaAsync(schema: z.ZodTypeAny, params: any) {
  const res = await schema.safeParseAsync(params);
  return res.success;
}
