# Drizzle zod schemas: known issues

_Last checked: 2026-07-18, `drizzle-orm@1.0.0-rc.4`._

## `jsonb`/`json` columns lose their `.$type<T>()` generic

`createSelectSchema` / `createInsertSchema` / `createUpdateSchema` (from `drizzle-orm/zod`) infer a generic `Json` type for any `jsonb`/`json` column, regardless of the column's `.$type<T>()` builder call. This surfaced as `packages/database/src/repositories/agent.repo.ts` failing to type-check with `Type 'Json[]' is not assignable to type 'AgentTools'` when passing `ICreateAgent['tools']` into a Drizzle insert/update.

**Why:** `drizzle-orm/zod/column.d.ts` maps every json-family column straight to `jsonSchema: z.ZodType<Json>` (`Json` = the recursive `string | number | boolean | null | Json[] | { [key: string]: Json }` union). The schema generator only looks at the column's SQL data type (`json`), not the TypeScript type parameter passed to `.$type<T>()` on the column builder — that generic only affects `$inferSelect`/`$inferInsert`, not the derived zod schema. So any table with a typed jsonb column produces a zod-inferred type (`AgentCreateSchema`, etc.) that's incompatible with the Drizzle-inferred type (`Agent`, `NewAgent`) for that same field.

The same pattern hits every typed jsonb column in the schema: `agent.tools` / `agent.settings`, `aiModel.capabilities` / `aiModel.meta`, and `chatMessage.metadata`. All of these have been fixed with explicit refinements in `packages/database/src/zod/index.ts`.

**How to apply:** for every jsonb column with a `.$type<T>()` annotation that's consumed as `T` elsewhere in the codebase, pass an explicit zod refinement for that column into `createSelectSchema`/`createInsertSchema`/`createUpdateSchema`. The refinement can be a full replacement `z.ZodType`, not just a `(schema) => schema.refine(...)` callback — see `packages/database/src/zod/index.ts`:

```ts
// packages/database/src/schema/agent.schema.ts
export const agentToolValues = ['think', 'webSearch', /* ... */] as const;
export type AgentTool = (typeof agentToolValues)[number];

// packages/database/src/zod/index.ts
const agentToolsSchema = z.array(z.enum(agentToolValues));
const agentSettingsSchema = z.object({
  temperature: z.number().nullish(),
  maxOutputTokens: z.number().nullish(),
});
const agentRefine = { tools: agentToolsSchema, settings: agentSettingsSchema };

export const agentCreateSchema = createInsertSchema(agent, agentRefine);
```

Keep the union type's runtime values in a `const` array (`agentToolValues`) alongside the type, rather than only declaring `type AgentTool = 'a' | 'b' | ...`, since the zod refinement needs a runtime source for `z.enum(...)`.

For open-ended jsonb columns (no fixed shape, e.g. `AiModelMeta`/`chatMessage.metadata`, both effectively `Record<string, any>`), `z.record(z.string(), z.any())` is enough to escape the recursive `Json` union; there's no need to model the shape precisely since the consuming code doesn't rely on it either.

If a new jsonb column is added with `.$type<T>()`, add the matching refinement in `packages/database/src/zod/index.ts` at the same time, otherwise the repo file that writes to it won't type-check.
