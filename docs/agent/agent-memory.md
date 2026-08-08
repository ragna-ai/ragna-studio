# Agent memory

**Status: implemented (Phase 1, 2026-07-18).** Phase 2 (embeddings, semantic recall, background extraction) not started.

Per-agent long-term memory. Each agent keeps a single markdown **memory document** it edits during a chat, and that document is automatically injected into the system prompt on every later turn, so the agent "remembers" across conversations.

This PRD describes **Phase 1**, which is the functional core: a write tool plus prompt injection. Phase 2 (embeddings, semantic recall, background extraction) is scoped at the end but not built here.

## Design decisions

These are settled. Do not re-open them.

| Decision       | Choice                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**      | Per **agent**. Memories belong to one agent, not to the user globally. Each agent has its own isolated pool.                    |
| **Storage**    | **One row per agent** holding a single markdown document (not one row per fact). Row-per-fact adds no benefit at this scale and complicates the write tool. |
| **Write path** | Inline `memory` tool the model calls mid-conversation. Two actions, `append` and `replace` (Anthropic memory-tool style). Background auto-extraction is Phase 2. |
| **Read path**  | Auto-inject: the agent's memory document is appended verbatim to the system prompt every turn. A `recallMemory` search tool is Phase 2. |
| **Retrieval**  | None in Phase 1. The whole document is injected. pgvector is Phase 2 and would require chunking the document.                  |

## Schema

New file `packages/database/src/schema/memory.schema.ts`:

```ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';

export const agentMemory = pgTable('agent_memories', {
  id: primaryIdColumn,
  agentId: text('agent_id')
    .notNull()
    .unique()
    .references(() => agent.id, { onDelete: 'cascade' }),
  content: text('content').notNull().default(''), // markdown, agent-managed
  ...timestamps,
});

export type AgentMemory = typeof agentMemory.$inferSelect;
export type NewAgentMemory = typeof agentMemory.$inferInsert;
```

- One row per agent. `agentId` is **unique**, so the write path upserts on conflict and the unique constraint doubles as the lookup index (no separate index needed).
- `content` is a single markdown document, defaulting to `''`. No `category`, no `userId` (the agent already carries `userId`; ownership is enforced through the agent), no `chatId`, no `embedding` in Phase 1.

Export the new schema from `packages/database/src/schema/index.ts`, **and register `agentMemory` in `packages/database/src/schema/relations.ts`** (add it to the `schema` object passed to `defineRelations`, plus an `agent.memory` ↔ `agentMemory.agent` one-to-one). The `db` instance is built with `drizzle({ relations })`, so a table missing from that graph triggers a "relation is missing" error. Apply with:

```bash
pnpm --filter @repo/database db:push
```

Do **not** write a SQL migration by hand (repo convention: push schema directly).

## Repository

New file `packages/database/src/repositories/memory.repo.ts`, following the shape of `agent.repo.ts` and `chat.repo.ts`:

| Function                             | Behavior                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `getMemoryByAgentId({ agentId })`    | The agent's memory row, or `null` if it has none yet.                           |
| `upsertMemory({ agentId, content })` | Insert the row, or update `content` on conflict with the unique `agentId`. Returns the row. |

Everything is keyed by `agentId`, so the tool can only ever touch the calling agent's own row. Export from `packages/database/src/repositories/index.ts`.

## Tool enum

Add `'memory'` to the `AgentTool` union in `packages/database/src/schema/agent.schema.ts`:

```ts
export type AgentTool =
  'think' | 'webSearch' | 'webBrowser' | 'imageGen' | 'linkedinDraft' | 'memory';
```

This makes `memory` a valid entry in an agent's `tools` array and in `activeTools`.

## Write tool

New file `packages/ai/src/tools/memory.tool.ts`. Model this on `image-gen.tool.ts` and `linkedin-draft.tool.ts` (they show the writer + deps + `tryCatch` + repo-call pattern). `@repo/ai` already depends on `@repo/database`, so import the repo functions directly.

The model always sees the current memory document in its system prompt (see read path), so the tool only needs to *edit* that document, not read it back. Two actions, modeled on the Anthropic memory tool:

- Export `getMemoryTool(writer, agentId)` returning a single `tool({...})`.
- Input schema (zod): a **flat `z.object`**, not a discriminated union. Anthropic's tool `input_schema` must have a top-level `type: "object"`; a `z.discriminatedUnion`/`z.union` compiles to top-level `anyOf` with no `type` and the API rejects it (`input_schema.type: Field required`). So use one object and enforce per-action requirements at runtime:
  - `action: z.enum(['append', 'replace'])`.
  - `text: z.string().optional()` — for `append`: appended as a new block at the end (blank-line separator if the doc is non-empty).
  - `old: z.string().optional()`, `new: z.string().optional()` — for `replace`: string-replace `old` with `new`; empty/omitted `new` deletes the matched text.
- In `execute`, validate: `append` requires `text`, `replace` requires `old` (return `{ error }` if missing).
- `.describe(...)` each field so the model knows *when* to write, e.g. "Save a durable fact about the user or task that will be useful in future conversations. Do not save transient or trivial details." Describe `replace` as the way to update or remove an existing fact.
- On execute (read-modify-write): load the current row with `getMemoryByAgentId`, apply the edit to `content`, then `upsertMemory`. Emit a transient `data-memory` stream event first (mirror the `data-imageGen` write in `image-gen.tool.ts`).
- For `replace`: if `old` is not found, or is found **more than once**, return `{ error }` and do not write. Requiring a unique match forces the model to quote enough surrounding context, the same guard the Anthropic `str_replace` tool uses.
- Return a tiny confirmation (`{ ok: true }`) or `{ error }`. Do not echo the whole document back into the model context.
- Read-modify-write is safe here because tool calls within a turn are sequential; the unique `agentId` upsert is the last-writer-wins boundary.
- Export the input/output/UI-tool types the same way the other tools do (`InferToolInput`, `InferToolOutput`, `InferUITool`).

### Wiring into the tool factory

`packages/ai/src/tools/agent.tools.ts`:

1. Add `memory: ReturnType<typeof getMemoryTool>` to the `AgentTools` type.
2. Extend `AgentToolDeps` with `agentId: string`.
3. In `tools()`, add `memory: getMemoryTool(writer, deps.agentId)`.

## Read path (auto-inject)

In `apps/api/src/controllers/chat.controller.ts`, `POST /:chatId`, before `streamText`:

1. **Gate on the tool being enabled**: only read/inject memory when `agent.tools.includes('memory')`. If the agent doesn't have the tool (or the user disabled it later), skip the `getMemoryByAgentId` call entirely and leave the system prompt untouched. This avoids a needless DB call and prevents injecting stale memory for agents where the feature is off.
2. When enabled, load `const memory = await getMemoryByAgentId({ agentId: agent.id })`.
3. Build a memory block only when `memory?.content` is non-empty, e.g.:

   ```
   <memory>
   Notes you have saved about this user and their work. Treat them as background knowledge.

   {memory.content}
   </memory>
   ```

4. Pass `instructions: memory?.content ? `${agent.systemPrompt}\n\n${memoryBlock}` : agent.systemPrompt`.
5. Update the tool factory call to pass the new deps:

   ```ts
   tools: tools(dataStream, { userId: user.id, agentId: agent.id }),
   ```

**As built:** this logic lives in `packages/ai/src/services/agent.service.ts` as `buildAgentInstructions({ agentId, tools, systemPrompt })`, a self-contained utility that takes plain primitives (no dependency on the DB `Agent` type). Internally it runs `loadAgentMemoryContent(agentId, tools)` (guard-clause early returns for the three skip reasons: tool disabled / read failed+logged / no saved memory) and a pure `buildInstructions` assembler. It lives in `@repo/ai` (not the API app) so both `apps/api/src/controllers/chat.controller.ts` and the workflow executor `apps/worker/src/workflow/executors/agent.executor.ts` can call it. Each caller passes it `agent.id`/`config.agentId`, `agent.tools`, `agent.systemPrompt` in one line. A failed memory read is logged (`logger.warn`) and degrades to the plain prompt, never throwing. Persistence, title generation, and streaming are unchanged.

### Workflow parity

The workflow "referenced agent" branch of `executeAgent` (`apps/worker/src/workflow/executors/agent.executor.ts`) runs a node exactly like chat: it calls `buildAgentInstructions` for the read path (same gate on `agent.tools.includes('memory')`) and passes `agentId: config.agentId` into the `tools()` factory for the write path, so the `memory` tool works there too. There is no separate tool picker on the workflow node; access is governed entirely by the referenced agent's own `tools` config. The inline (no-`agentId`) default-agent branch has no tools/settings and stays plain, unaffected by this.

## UI (shipped)

- A `memory` toggle in `apps/web/app/features/agent/components/AgentToolList.vue` (icon `NotebookPenIcon`), so users enable/disable the tool per agent like the others.
- A "Memory" tab in `AgentUpsertForm.vue` rendering `AgentMemoryPanel.vue` (a markdown `Textarea` with its own save, separate from the main agent form). When the agent is unsaved it shows the "save the agent first" placeholder, matching the Knowledge tab.
- `useGetAgentMemory` / `useUpdateAgentMemory` composables in `useAgentApi.ts`.
- API: `GET` + `PUT /agent/:agentId/memory` on `agent.controller.ts`, ownership-checked via `getAgentById({ agentId, userId })`, backed by `getMemoryByAgentId` / `upsertMemory`. `PUT` validates `{ content: string }` via `validAgentMemoryBody`.

## Files touched (Phase 1, as built)

| File                                                | Change                                  |
| --------------------------------------------------- | --------------------------------------- |
| `packages/database/src/schema/memory.schema.ts`     | New: `agent_memories` table.            |
| `packages/database/src/schema/index.ts`             | Export the new schema.                  |
| `packages/database/src/schema/relations.ts`         | Register `agentMemory` + agent one-to-one. |
| `packages/database/src/repositories/memory.repo.ts` | New: `getMemoryByAgentId` / `upsertMemory`. |
| `packages/database/src/repositories/index.ts`       | Export the new repo.                    |
| `packages/database/src/schema/agent.schema.ts`      | Add `'memory'` to `AgentTool`.          |
| `packages/ai/src/tools/memory.tool.ts`              | New: `getMemoryTool` (flat object schema). |
| `packages/ai/src/tools/agent.tools.ts`              | Register tool + extend `AgentToolDeps`. |
| `packages/ai/src/tools/index.ts`                    | Re-export `memory.tool`.                |
| `packages/ai/src/services/agent.service.ts`         | New: `buildAgentInstructions` (gate + inject), shared by API and worker. |
| `apps/api/src/controllers/chat.controller.ts`       | Call `buildAgentInstructions`; pass `agentId` dep. |
| `apps/worker/src/workflow/executors/agent.executor.ts` | Call `buildAgentInstructions`; pass `agentId` dep to `tools()`. |
| `apps/api/src/controllers/agent.controller.ts`      | `GET` + `PUT /:agentId/memory`.         |
| `apps/api/src/middlewares/validationMiddlewares.ts` | New `validAgentMemoryBody`.             |
| `apps/web/app/features/agent/composables/useAgentApi.ts` | `useGetAgentMemory` / `useUpdateAgentMemory`. |
| `apps/web/app/features/agent/types/index.ts`        | Memory request/response types.          |
| `apps/web/app/features/agent/components/AgentMemoryPanel.vue` | New: memory editor panel.      |
| `apps/web/app/features/agent/components/AgentUpsertForm.vue` | "Memory" tab.                   |
| `apps/web/app/features/agent/components/AgentToolList.vue` | `memory` tool toggle.             |
| `apps/web/i18n/locales/{en-UK,de-DE}.json`          | `memory` tool strings.                  |

Then run `pnpm --filter @repo/database db:push`.

## Acceptance criteria

- An agent with `memory` in its `tools` can `append` during a chat; the agent's single `agent_memories` row is created/updated with the correct `agentId`.
- `replace` edits that row in place; an empty `new` removes the matched text; a non-unique or missing `old` returns an error and writes nothing.
- On a **new** chat with the **same** agent, the saved notes appear in the system prompt and the agent can use them without being told again.
- Agents without `memory` in `activeTools` are unaffected; no memory block leaks in when the document is empty or absent.
- `pnpm check-types` and `pnpm lint` pass.

## Known follow-ups (open, non-blocking)

Surfaced during implementation, deliberately left out of Phase 1:

- **EN i18n tool-label mismatch (pre-existing bug).** Tool components read `agent.tool.<id>.label`, but `en-UK.json` stores strings at `agent.tools.<id>.title` (both the path segment and the leaf key differ). So English falls back to raw keys for **all** tools, not just `memory`. It goes unnoticed because `defaultLocale` is `de` and `de-DE.json` matches the components. The `memory` strings were added mirroring this quirk so it behaves like its siblings. Fix (whenever): rename the EN entries to `agent.tool.<id>.{label,description}` to match the components and German.
- **Chat transcript label for the memory tool.** `ChatMessage.vue` has a tool-name map for rendering tool calls in the conversation and has no `memory` entry, so a memory tool call won't show a friendly label in the transcript. Purely additive.

## Phase 2 (not now)

- Chunk the memory document and add an `embedding vector(1024)` per chunk (likely a separate `agent_memory_chunks` table) plus an embedding pipeline on write.
- `recallMemory(query)` tool doing pgvector top-K similarity search over chunks; switch injection from "whole document" to "on-demand recall" once documents grow large.
- Background extraction: a worker processor (queue pattern in `@repo/queue` + `apps/worker/src/processors/`) that mines finished chats for durable facts instead of relying only on the inline tool.
