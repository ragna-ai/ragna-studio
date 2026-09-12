import { z } from 'zod';

/** Page sizes offered by `PaginateControls`' `Select` (app/components/PaginateControls.vue) -
 * a `limit` outside this list leaves the select bound to a value with no matching `SelectItem`,
 * which Radix/shadcn renders blank instead of falling back to the first option. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Vue Router query values can be a single string, repeated (`string[]`), or missing
 * (`undefined`)/explicit-empty (`null`). Every field below falls back to its default via
 * `.catch()` for any shape that doesn't parse, so this never throws and callers never need to
 * pre-sanitize `route.query` themselves.
 */
export const chatSearchQuerySchema = z.object({
  q: z.string().trim().catch(''),
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce
    .number()
    .refine((value) =>
      PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number]),
    )
    .catch(10),
});

export type ChatSearchQuery = z.infer<typeof chatSearchQuerySchema>;

export function parseChatSearchQuery(query: unknown): ChatSearchQuery {
  return chatSearchQuerySchema.parse(query);
}
