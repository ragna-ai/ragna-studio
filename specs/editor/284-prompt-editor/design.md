# Prompt editor: design

Status: proposed (2026-11-05). Design for [prd.md](./prd.md). Build plan in [slices.md](./slices.md).

## Today

- `@repo/editor` builds every editor from `createRichTextEditor({ contentType, ... })`. The
  extension list (`kit.ts`) is the same for all callers. Only the markdown extension is toggled
  by `contentType`.
- `apps/web/app/components/editor/` wraps it: `useRichTextEditor()`, `RichTextEditor.vue` and
  three menus. The bubble menu and the slash menu always show every block.
- Three callers: `DocumentEditor.vue` and `TaskDescriptionEditor.vue` (`'markdown'`),
  `EmailComposer.vue` (`'html'`).
- `@tiptap/markdown` 3.32.0 escapes every text node on write:
  `MarkdownManager.encodeTextForMarkdown()` encodes HTML entities and backslash-escapes
  ``\ ` * _ [ ] ~``. There is no option to turn it off, and the method is `private` in the
  type declarations.

## Extension points

**Axis:** the editor profile. It decides the stored format, how text is written and what the
menus offer. **Contract:** `EditorProfile` in `@repo/editor`.

| Profile    | Used by                                                                     | Format   | Text on write | Menus offer                           |
| ---------- | --------------------------------------------------------------------------- | -------- | ------------- | ------------------------------------- |
| `document` | documents, task description                                                 | markdown | escaped       | everything                            |
| `email`    | email composer                                                              | html     | n/a           | everything                            |
| `prompt`   | agent instructions and context, workflow agent and team node prompts (#284) | markdown | verbatim      | everything except `image`, `taskList` |

**Adding a profile:** add its id to `EditorProfileId`, add one entry to `EDITOR_PROFILES`, add
its tests. Type-checking fails if an id has no entry. No caller or menu changes.

**Adding a prompt field:** replace the `<Textarea>` with `<MarkdownEditorField v-model="...">`.
It brings the raw view with it.

**Adding a view switch elsewhere:** pass a `ViewOption[]` list to `ViewSwitcher.vue`.

**Faked in tests:** nothing. Profile tests in `packages/editor/test/` build a real
`MarkdownManager` from the profile's extensions. That runs without a DOM, so no new dependency.

**Packages considered:** a markdown source editor (CodeMirror 6) for the raw view. Not added:
the raw view is a plain `Textarea`, which keeps every byte and needs no dependency.

**Not abstracted:** the extension list stays the same for every profile. Profiles never remove
nodes from the schema, so content a menu doesn't offer still parses and survives a save.

## `@repo/editor`

### `src/profiles.ts` (new)

```ts
export type EditorProfileId = 'document' | 'email' | 'prompt';

export type EditorProfile =
  | { contentType: 'html'; slashCommands: readonly SlashCommandId[]; blockToggles: readonly BlockType[] }
  | {
      contentType: 'markdown';
      /** 'verbatim' writes text nodes as typed: no HTML entities, no backslash escapes. */
      textEncoding: 'escaped' | 'verbatim';
      slashCommands: readonly SlashCommandId[];
      blockToggles: readonly BlockType[];
    };

export const EDITOR_PROFILES = { document: ..., email: ..., prompt: ... } satisfies Record<EditorProfileId, EditorProfile>;

export function getEditorProfile(id: EditorProfileId): EditorProfile;
```

- `slashCommands` lists what the `/` menu offers, in menu order. `blockToggles` lists the list,
  quote and code toggles the bubble menu offers (`bulletList`, `orderedList`, `taskList`,
  `blockquote`, `codeBlock`). Headings and text formats are in every profile and aren't listed.
- The union makes "html with verbatim text" impossible to write.
- The menu labels, icons and shortcuts stay in `apps/web`. The profile holds only ids.

### `src/verbatim-markdown.ts` (new)

`disableTextEscaping(manager: MarkdownManager): void` replaces `encodeTextForMarkdown` on that
one manager instance with `(text) => text`.

- The method is `private` in the declarations, so it is reached by element access
  (`manager['encodeTextForMarkdown']`), which TypeScript allows for private members. No `any`, no
  `as`. One short comment says why.
- Per instance, never on the prototype: documents keep escaping.
- Code marks and code blocks were never escaped, so verbatim changes only plain text.

### `src/rich-text-editor.ts` (changed)

- `CreateRichTextEditorOptions.contentType` is replaced by `profile: EditorProfileId` (required).
- `createRichTextEditor()` reads the profile, loads `Markdown` when `contentType` is
  `'markdown'`, and calls `disableTextEscaping(editor.markdown)` right after construction when
  `textEncoding` is `'verbatim'`. The constructor only parses, so writing is never affected
  before the override.
- `setEditorContent(editor, content, contentType)` passes `emitUpdate: false`. Content set from
  outside must never fire `onUpdate`.

### `test/` (new)

- `package.json` gets `"test": "bun test"`. Tests build a `MarkdownManager` from
  `createRichTextEditorExtensions({ hasMarkdown: true })` and apply `disableTextEscaping` for
  `prompt`, so they test the same code path the editor uses.
- Round-trip cases (US-2.1, US-2.3, US-2.4): block and inline XML tags, `{{vars}}` with
  underscores, `2 * 3`, a GFM table holding `{{x}}` and `<y>`, an image, a task list, headings,
  lists, a fenced code block. Each: `serialize(parse(input))` is identical, and a second pass
  doesn't drift.
- A `document` profile case that still escapes `snake_case`, so verbatim never leaks.
- US-1.2: `EDITOR_PROFILES.prompt.slashCommands` has no `image` and no `taskList`.

## `apps/web`

### Editor core (`app/components/editor/`)

- `UseRichTextEditorOptions.contentType` is replaced by `profile: EditorProfileId`. The
  controller exposes `profile: EditorProfile` instead of `contentType`.
- `EditorSlashMenu.vue` shows only the `SLASH_ITEMS` whose id is in
  `controller.profile.slashCommands`. `EditorBubbleMenu.vue` does the same for
  `BLOCK_TOGGLE_ITEMS` against `blockToggles`.
- The three callers pass `profile: 'document'` (documents, tasks) or `'email'`.

### `MarkdownEditorField.vue` (new, `app/components/editor/`)

The reusable form field for markdown text. Props:

```ts
export interface MarkdownEditorFieldProps {
  profile?: 'document' | 'prompt'; // default 'prompt'
  placeholder?: string;
  invalid?: boolean;
  maxLength?: number; // shows the character count; no count without it
  class?: HTMLAttributes['class'];
}
// v-model: defineModel<string>({ required: true })
// emits: blur
```

- Built on `useRichTextEditor` and `RichTextEditor.vue`. No second editor setup.
- **Writes only on user edits (US-2.2).** `onUpdate` sets the model. Loading content never does.
- **Follows outside changes (US-3.2).** It watches the model. When the value differs from the
  last value it emitted, it calls `controller.setContent()` (no update event).
- **Looks like a form control.** It uses the `Textarea` border, radius, focus ring
  (`focus-within`) and `aria-invalid` styles, merged with `cn()`. The caller sets the height
  through `class`.
- **Accessible name.** It accepts `aria-labelledby` and passes it to the editable element and
  to the raw textarea.

**Raw view (US-4).** A `ViewSwitcher` in the field's header row, aligned right, switches between
`formatted` and `raw`.

```ts
export type MarkdownFieldView = 'formatted' | 'raw';
// labels: editor.view.formatted ("Formatted"), editor.view.raw ("Raw"); icons TypeIcon, CodeXmlIcon
```

- `raw` shows a `Textarea` bound to the same model. It edits the stored text directly, so what
  the user types is saved byte for byte.
- The rich editor stays mounted while hidden (`v-show`). Back in `formatted`, the "follows
  outside changes" rule loads the raw edits. Switching views never writes the model.
- The choice is one preference for every prompt field: `useLocalStorage<MarkdownFieldView>(
  'markdown-field:view', 'formatted')`. VueUse syncs it between fields on the same page.
- The `invalid` style and `blur` apply to both views.

**Character count (US-5.6, US-5.7).** With `maxLength` set, a footer row shows
`12,345 / 30,000` in the bottom right corner, in both views.

- It counts `model.length`: the stored markdown, the same value the API checks. In the
  formatted view that includes markup like `# ` and `**`.
- Numbers use the active locale (vue-i18n `n()`). Copy: `editor.charCount`, "{count} / {max}".
- Over the limit, the count turns `text-destructive`. The form's schema error does the
  blocking.
- No `maxlength` attribute and no truncation: cutting a paste short would silently lose text.
- The count isn't announced on every keystroke. The schema error is the accessible signal.

### `ViewSwitcher.vue` (new, `app/components/`)

The segmented control from the tasks page, made generic. Same shadcn `Tabs` markup and classes
as `TaskViewSwitcher.vue` today.

```ts
export interface ViewOption<T extends string> {
  value: T;
  labelKey: string;
  icon: LucideIcon;
}
// <script setup lang="ts" generic="T extends string">
// props: { options: readonly ViewOption<T>[] }, v-model: defineModel<T>({ required: true })
```

- It maps the `Tabs` value back by finding the matching option, so no `as` cast is needed.
- The tasks page uses it directly with its own `TASK_VIEWS` list. `TaskViewSwitcher.vue` is
  deleted, and `TaskView` moves next to `TASK_VIEWS` in `features/task/`.

### Surfaces

| File                                                | Field                     | Replaces             |
| --------------------------------------------------- | ------------------------- | -------------------- |
| `features/agent/components/AgentUpsertForm.vue`     | `systemPrompt` (persona)  | `<Textarea>`         |
| `features/agent/components/AgentUpsertForm.vue`     | `context`                 | `<Textarea>`         |
| `features/workflow/.../WorkflowAgentConfigForm.vue` | `node.data.config.prompt` | `<Textarea v-model>` |
| `features/workflow/.../WorkflowTeamConfigForm.vue`  | `node.data.config.prompt` | `<Textarea v-model>` |

- In the agent form, the field binds to TanStack Form: `:model-value="state.value"`,
  `@update:model-value="field.handleChange"`, `@blur="field.handleBlur"`,
  `:invalid="state.meta.errors.length > 0"`.
- The unused `#instructions` tab template in `AgentUpsertForm.vue` (its sidebar entry is
  commented out) is deleted.
- The workflow transform template stays a `<Textarea>`.

## API and data

No storage change. `agents.system_prompt`, `agents.context` and the workflow node config stay
plain text. Prompts written before this change load as markdown. They are only rewritten once
the user edits the field.

### Length limits (US-5)

A rich text editor can't handle the multi-megabyte values a textarea copes with. The limits are
checked on write only, so existing longer prompts still load, chat and run.

| Constant                        | Value  | Lives in                                 | Applied by                                                    |
| ------------------------------- | ------ | ---------------------------------------- | ------------------------------------------------------------- |
| `AGENT_INSTRUCTIONS_MAX_LENGTH` | 30,000 | `packages/ai/src/agent-limits.ts`        | API agent create/update, `AgentUpsertForm.vue`                |
| `AGENT_CONTEXT_MAX_LENGTH`      | 30,000 | `packages/ai/src/agent-limits.ts`        | same, replaces the four `30_000` literals                     |
| `WORKFLOW_PROMPT_MAX_LENGTH`    | 30,000 | `packages/workflow/src/config.schema.ts` | `agentConfigSchema.prompt`, `delegateTeamConfigSchema.prompt` |

- `agent-limits.ts` is exported from both `@repo/ai` and the browser-safe `@repo/ai/client`. It
  holds plain constants and imports nothing.
- `systemPrompt` keeps accepting an empty string, as today.
- The workflow limit sits in the shared node config schemas. The API parses them only on save
  (`validation/workflow.schema.ts`), and the web draft check (`validate-draft.ts`) already
  shows their issues under the prompt field. The worker never parses them, so stored workflows
  keep running.
- The update route stays a PATCH: a request without `systemPrompt` never checks its length
  (US-5.5).
- Agent templates are seeded by the platform and not limited.
