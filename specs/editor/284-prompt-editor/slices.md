# Prompt editor: implementation slices

Status: proposed (2026-11-05). Build plan for [prd.md](./prd.md) and [design.md](./design.md).

Three waves, one PR. Each wave builds against the real types of the wave before it. S1 and S4
run in parallel: they share no files.

| Wave | Slice              | Owns                                                                                                                                                                                                                                                                                                  | Delivers                                                                       |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | S1 `@repo/editor`  | `packages/editor/**`                                                                                                                                                                                                                                                                                  | US-1.2, US-2.1, US-2.3, US-2.4                                                 |
| 1    | S4 Length limits   | `packages/ai/src/agent-limits.ts`, the `@repo/ai` index and client exports, `packages/workflow/src/config.schema.ts`, `apps/api/src/validation/agent.schema.ts`, `apps/api/test/agent/`, `apps/api/test/workflow/`                                                                                    | US-5.1, US-5.3 to US-5.5                                                       |
| 2    | S2 Web editor core | `apps/web/app/components/editor/**`, `apps/web/app/components/ViewSwitcher.vue`, `DocumentEditor.vue`, `TaskDescriptionEditor.vue`, `EmailComposer.vue`, `TaskViewSwitcher.vue` (delete), `pages/tasks/index.vue`, task view constants in `features/task/`, `editor.view.*` keys in both locale files | C2, C3, C4                                                                     |
| 3    | S3 Surfaces        | `AgentUpsertForm.vue`, `WorkflowAgentConfigForm.vue`, `WorkflowTeamConfigForm.vue`, `apps/web/e2e/prompt-editor.spec.ts`, the four `apps/docs` pages                                                                                                                                                  | US-1.1, US-1.3, US-2.1, US-2.2, US-2.5, US-3.x, US-4.x, US-5.2, US-5.6, US-5.7 |
| 4    | Lead: integration  | `.github/workflows/ci.yml`, spec bookkeeping, anything else                                                                                                                                                                                                                                           | all                                                                            |

## Rules for every slice

- Follow AGENTS.md. Load the `clean-code` skill first. S1 also loads `tiptap`. S3 also loads
  `docs-writing` for the docs pages.
- Stay inside your owned paths. If you need something outside them, stop and report it.
- After editing `@repo/editor`, rebuild it with `pnpm --filter @repo/editor build`.
- Run `pnpm check-types` before reporting done. Run the tests you own (S1: `pnpm --filter
  @repo/editor test`, S3: `pnpm test:e2e -- prompt-editor`).
- Read Tiptap APIs in the installed `node_modules/@tiptap/*` (3.32.0), not from memory.
- No commits, no docker commands, no browser verification.
- End with a **Flags** section: every assumption, doubt and deviation. Copy changed signatures
  verbatim.

## Contracts

Pinned so the waves line up. Changing one means reporting it, not silently adapting.

### C1: `@repo/editor` exports (S1 provides)

```ts
export type EditorProfileId = 'document' | 'email' | 'prompt';
export type EditorProfile = /* discriminated union from design.md */;
export const EDITOR_PROFILES: { readonly [K in EditorProfileId]: EditorProfile };
export function getEditorProfile(id: EditorProfileId): EditorProfile;

export interface CreateRichTextEditorOptions {
  profile: EditorProfileId; // replaces contentType
  content?: string;
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
  slashCommand?: SlashCommandHandlers;
  onLinkShortcut?: () => void;
}
// getEditorContent / setEditorContent keep their signatures.
// setEditorContent never fires onUpdate.
```

`document` and `email` offer every slash command and block toggle they offer today, in today's
order. `prompt` offers the same minus `image` and `taskList`.

### C2: web controller (S2 provides)

```ts
export interface UseRichTextEditorOptions {
  content: string;
  profile: EditorProfileId; // replaces contentType
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
}
// RichTextEditorController: `contentType: ContentType` is replaced by `profile: EditorProfile`.
```

### C3: `MarkdownEditorField.vue` (S2 provides)

```vue
<MarkdownEditorField
  v-model="value"            <!-- string, required -->
  profile="prompt"           <!-- 'document' | 'prompt', default 'prompt' -->
  :placeholder="..."
  :invalid="hasErrors"
  aria-labelledby="label-id"
  :max-length="AGENT_INSTRUCTIONS_MAX_LENGTH"  <!-- optional, shows the count -->
  class="min-h-60"
  @blur="..."
/>
```

Behavior from design.md: it sets the model only on user edits, follows outside changes without
emitting, and uses the `Textarea` look.

It has the formatted/raw switch built in (design.md "Raw view"). Callers pass nothing for it.

### C4: `ViewSwitcher.vue` (S2 provides)

```vue
<ViewSwitcher v-model="view" :options="TASK_VIEWS" />
<!-- options: readonly ViewOption<T>[] = { value: T; labelKey: string; icon: LucideIcon }[] -->
```

## S1 `@repo/editor`

1. `src/profiles.ts` and `src/verbatim-markdown.ts` as in design.md. Export both from
   `src/index.ts`.
2. `createRichTextEditor()` takes `profile`. `setEditorContent()` passes `emitUpdate: false`.
3. `test/` with `bun test` and the cases listed in design.md. No new dependency. If the tests
   can't run without a DOM, stop and report.
4. Leave `apps/web` broken on `contentType`. S2 fixes the callers. Report the errors you see.

## S4 Length limits

Test first (tdd skill). The design is in design.md "Length limits".

1. Write the failing API tests: create and update over the limit return `400` for
   `systemPrompt`, `context` and both workflow prompt kinds. A seeded agent with a longer prompt
   still accepts a name-only update. A stored workflow with a longer prompt still runs.
2. Add the constants and apply them in the API schema and the workflow config schemas.
3. Rebuild `@repo/ai` and `@repo/workflow`. Run `pnpm test:api`.

## S2 Web editor core

1. Switch `useRichTextEditor`, `types.ts` and the three callers to `profile` (C2).
2. Filter the slash menu and the bubble menu block toggles by the controller's profile.
3. Build `MarkdownEditorField.vue` (C3). Match the `Textarea` classes in
   `app/components/ui/textarea/Textarea.vue`. Don't edit the `ui/` file.
4. Build `ViewSwitcher.vue` (C4) from `TaskViewSwitcher.vue`'s markup. Move the tasks page onto
   it, then delete `TaskViewSwitcher.vue`. The tasks page must look and behave the same.
5. Add the raw view to `MarkdownEditorField.vue` with `ViewSwitcher`. Add `editor.view.formatted`
   and `editor.view.raw` to `en-UK.json` and `de-DE.json` ("Formatiert", "Rohtext").
   Add the character count (design.md "Character count") and the `editor.charCount` key.
6. No feature surfaces. S3 switches them.

## S3 Surfaces

1. Switch the four fields in design.md "Surfaces" to `MarkdownEditorField`. Delete the unused
   `#instructions` template in `AgentUpsertForm.vue`. In its form schema, apply
   `AGENT_INSTRUCTIONS_MAX_LENGTH` and `AGENT_CONTEXT_MAX_LENGTH` from `@repo/ai/client`. Pass
   the matching constant as `max-length` to all four fields (`WORKFLOW_PROMPT_MAX_LENGTH` from
   `@repo/workflow` for the workflow prompts).
2. `apps/web/e2e/prompt-editor.spec.ts` covers US-1.1, US-1.3, US-2.1, US-2.2, US-3.1 to US-3.3
   US-4.1 to US-4.5, US-2.5, US-5.2, US-5.6 and US-5.7. For US-2.5, seed the instructions through the API. Read `apps/web/e2e/README.md` and an existing spec first. Name tests after the
   behavior, not the criterion id.
3. Update the four docs pages listed in the PRD standards checklist: formatting in the field,
   the raw view, and that tags and `{{input}}` reach the model as written.

## Lead: integration

- Add `pnpm --filter @repo/editor test` to the `build-and-check` job in `ci.yml`.
- Run `pnpm check-types`, `pnpm lint`, `pnpm format`, and all three test suites touched.
- Spec bookkeeping: PRD status, `pnpm specs:index`, `specs/overview.md`, `Closes #284`.
- File a follow-up issue: ask Tiptap upstream for a public option to turn off text escaping, so
  the private-method override can go.
