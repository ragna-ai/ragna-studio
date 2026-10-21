# Rich text editor: implementation slices

Status: in-progress (decided 2026-10-21, building on `feat/shared-editor`). Build plan for [prd.md](./prd.md).

Three waves, one PR. Wave 1 builds the `@repo/editor` package and the copy (i18n, docs) in
parallel. Wave 2 builds the shared web editor and its menus in parallel, against real package
types. Wave 3 moves the three surfaces onto it and deletes the old code.

| Wave | Slice                     | Owns                                               | Depends on     |
| ---- | ------------------------- | -------------------------------------------------- | -------------- |
| 0    | Lead: contract file       | `apps/web/app/components/editor/types.ts`          | none           |
| 1    | S1 `@repo/editor`         | `packages/editor/**`                               | C1             |
| 1    | S2 Copy                   | locale files, `apps/docs` pages                    | C4             |
| 2    | S3 Editor core            | composable, `RichTextEditor.vue`, forms, CSS       | S1, C2, C3     |
| 2    | S4 Bubble and table menus | `EditorBubbleMenu.vue`, `EditorTableMenu.vue`      | S1, C2, C3, C4 |
| 2    | S5 Slash menu             | `EditorSlashMenu.vue`, `slash-items.ts`            | S1, C2, C3, C4 |
| 3    | S6 Surfaces               | the three feature components, task page, deletions | S3, S4, S5     |
| 3    | Lead: integration         | anything                                           | all            |

Wave 1 could also run as part of wave 2 against C1 alone, but then wave 2 can't type-check.
Real types are worth the short wait: S1 is the smallest slice.

## Rules for every slice

- Load the `clean-code` skill first. No `as any`. Named exported interfaces for return types.
- Comments: default to zero. Only a non-obvious "why", one line max.
- Stay inside your owned paths. If you need something outside them, stop and report it. Don't
  edit it.
- After editing `@repo/editor`, rebuild it with `pnpm --filter @repo/editor build`.
- Run `pnpm check-types` before reporting done. Wave 2 slices may see errors in files owned by
  another wave 2 slice that isn't done yet. Report those, don't fix them.
- No commits, no browser verification. Sven does those.
- When a library API is uncertain (Tiptap, `@tiptap/suggestion`, reka-ui), read it in
  `node_modules` (the installed version), not from memory.
- End your report with a **Flags** section: every assumption, every doubt, every deviation from
  the PRD or this doc. Copy changed signatures verbatim from the file.

## Contracts

Pinned so slices can build in parallel. Changing one means reporting it, not silently
adapting.

### C1: `@repo/editor` exports (S1 provides)

```ts
export type ContentType = 'markdown' | 'html';
export type TextFormat = 'bold' | 'italic' | 'strike' | 'code';
export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock';
export type SlashCommandId = BlockType | 'horizontalRule' | 'table' | 'image';

export interface SlashCommandSession {
  query: string;
  clientRect: () => DOMRect | null;
  // Deletes the typed "/query" and runs the command. For 'image' it only deletes the text;
  // the web side opens the image form.
  select: (id: SlashCommandId) => void;
}

export interface SlashCommandHandlers {
  onStart: (session: SlashCommandSession) => void;
  onUpdate: (session: SlashCommandSession) => void;
  // Return true when the menu handled the key (arrows, Enter). Escape is handled by the
  // extension: it closes the menu and keeps the text.
  onKeyDown: (event: KeyboardEvent) => boolean;
  onExit: () => void;
}

export interface CreateRichTextEditorOptions {
  content?: string;
  contentType?: ContentType; // default 'markdown'
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
  slashCommand?: SlashCommandHandlers;
  onLinkShortcut?: () => void; // Mod-k
}

export function createRichTextEditor(options?: CreateRichTextEditorOptions): Editor;
export function getEditorContent(editor: Editor, contentType: ContentType): string;
export function setEditorContent(editor: Editor, content: string, contentType: ContentType): void;
export function getEditorText(editor: Editor): string;

export function formatText(editor: Editor, format: TextFormat): boolean;
export function setBlockType(editor: Editor, type: BlockType): boolean;
// 'mixed' when the selection spans blocks of different types.
export function getActiveBlockType(editor: Editor): BlockType | 'mixed';
export function setHorizontalRule(editor: Editor): boolean;
export function focusEnd(editor: Editor): boolean;

export function isInsideTable(editor: Editor): boolean;
export function insertTable(editor: Editor): boolean; // 3x3, header row
export function addRowBefore(editor: Editor): boolean;
export function addRowAfter(editor: Editor): boolean;
export function deleteRow(editor: Editor): boolean;
export function addColumnBefore(editor: Editor): boolean;
export function addColumnAfter(editor: Editor): boolean;
export function deleteColumn(editor: Editor): boolean;
export function deleteTable(editor: Editor): boolean;

export function getLinkUrl(editor: Editor): string;
export function setLink(editor: Editor, url: string): boolean;
export function unsetLink(editor: Editor): boolean;
export function insertImage(editor: Editor, url: string): boolean;

export { Editor, EditorContent } from '@tiptap/vue-3';
export { BubbleMenu } from '@tiptap/vue-3/menus';
```

`setBlockType` sets, it doesn't toggle. Picking the type a block already has is a no-op.
Picking `paragraph` inside a list lifts the items out of the list.

Removed exports (`createDocumentEditor`, `getDocumentMarkdown`, `setDocumentContent`,
`cycleList`, `cycleTextOrientation`, `toggleTaskList`, `toggleCodeBlock`, `undo`, `redo`,
`toggleHeaderRow`, `toggleHeaderColumn`, `getCharacterCount`, `getWordCount`) break the three
old composables until wave 3. That is expected.

### C2: web controller (lead writes `components/editor/types.ts` before wave 2)

```ts
import type { BlockType, ContentType, Editor, SlashCommandId, TextFormat } from '@repo/editor';

export interface SlashMenuState {
  query: string;
  clientRect: () => DOMRect | null;
  select: (id: SlashCommandId) => void;
}

export interface RichTextEditorController {
  editor: ShallowRef<Editor | undefined>;
  contentType: ContentType;
  getContent: () => string;
  setContent: (content: string) => void;
  getText: () => string;
  focusEnd: () => void;

  formatText: (format: TextFormat) => boolean;
  setBlockType: (type: BlockType) => boolean;
  activeBlockType: () => BlockType | 'mixed';
  setHorizontalRule: () => boolean;

  isInTable: () => boolean;
  insertTable: () => boolean;
  addRowBefore: () => boolean;
  addRowAfter: () => boolean;
  deleteRow: () => boolean;
  addColumnBefore: () => boolean;
  addColumnAfter: () => boolean;
  deleteColumn: () => boolean;
  deleteTable: () => boolean;

  getLink: () => string;
  setLink: (url: string) => boolean;
  unsetLink: () => boolean;
  insertImage: (url: string) => boolean;

  // Set by Mod-k, read by the bubble menu.
  isLinkFormOpen: Ref<boolean>;
  // Set after the slash menu's 'image' item, read by the slash menu.
  isImageFormOpen: Ref<boolean>;
  // null while the slash menu is closed.
  slashMenu: Readonly<ShallowRef<SlashMenuState | null>>;
  // The slash menu registers its key handler on mount (arrows, Enter).
  setSlashKeyHandler: (handler: ((event: KeyboardEvent) => boolean) | null) => void;
}

export interface UseRichTextEditorOptions {
  content: string;
  contentType: ContentType;
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
}
```

### C3: component props

| Component              | Props                  | Emits  | Owner |
| ---------------------- | ---------------------- | ------ | ----- |
| `RichTextEditor.vue`   | `controller`, `class?` | none   | S3    |
| `EditorLinkForm.vue`   | `controller`           | `done` | S3    |
| `EditorImageForm.vue`  | `controller`           | `done` | S3    |
| `EditorBubbleMenu.vue` | `controller`           | none   | S4    |
| `EditorTableMenu.vue`  | `controller`           | none   | S4    |
| `EditorSlashMenu.vue`  | `controller`           | none   | S5    |

The forms are plain forms, not popovers. The menu that shows them owns the popover or panel.
`EditorLinkForm` prefills from `controller.getLink()` on mount and offers "Remove" when the
selection is on a link.

`RichTextEditor.vue` renders `EditorContent`, `EditorBubbleMenu`, `EditorTableMenu` and
`EditorSlashMenu`. All live in `apps/web/app/components/editor/`, so Nuxt auto-imports them.

### C4: i18n keys (S2 provides, in `en-UK.json` and `de-DE.json`)

```
editor.blockType.{paragraph,h1,h2,h3,h4,bulletList,orderedList,taskList,blockquote,codeBlock,mixed}
editor.blockType.label                     // aria-label of the dropdown
editor.format.{bold,italic,strike,code}
editor.link.{label,placeholder,apply,remove}
editor.image.{label,placeholder,insert}
editor.table.{label,addRowBefore,addRowAfter,deleteRow,addColumnBefore,addColumnAfter,deleteColumn,deleteTable}
editor.slash.{label,horizontalRule,table,image,noResults}
```

Slash entries for block types reuse `editor.blockType.*`. Aliases (`h1`, `ul`, `todo`, `hr`)
are not translated and live in code (S5).

Changed values: `document.editor.contentPlaceholder`, `task.detail.descriptionPlaceholder` and
`email.compose.bodyPlaceholder` get the "Type / for commands" hint.

`document.toolbar.*` stays until wave 3. S6 deletes it.

## Wave 1

### S1: `@repo/editor`

PRD sections 1 and "Code layout → packages/editor".

- `kit.ts`: drop `TextAlign`, `Underline`, `Highlight`, `CharacterCount`. Table
  `resizable: false`. Add `LegacyMarks` always. Add `SlashCommand` when `slashCommand` is set.
  Add the `Mod-k` shortcut when `onLinkShortcut` is set.
- `commands.ts`: the C1 command set.
- `slash-command.ts`: `SlashCommand` on `@tiptap/suggestion`, `char: '/'`, `allowSpaces:
  false`, `startOfLine: false`. Must not trigger inside a code block or inline code, or in
  the middle of a word.
- `legacy-marks.ts`: parse-only tokenizers for `++text++` and `==text==` that return the
  inner text without a mark. Model them on the `markdownTokenizer` in
  `@tiptap/extension-underline` and `@tiptap/extension-highlight`.
- `document-editor.ts` renamed to `rich-text-editor.ts` with the C1 names.
- `index.ts`: C1 exports.
- `package.json`: add `@tiptap/suggestion` and `@floating-ui/dom` (same versions as the
  installed peers), drop the three removed extension packages. Then `pnpm install`.

Already verified, don't rediscover:

- `@tiptap/extension-underline` writes `++text++`, `@tiptap/extension-highlight` writes
  `==text==`. Their tokenizers are the reference for `legacy-marks.ts`.
- `@tiptap/vue-3` 3.32 exports `BubbleMenu` from `@tiptap/vue-3/menus`.
- StarterKit already has the heading, list, blockquote, code and horizontal rule commands and
  their default shortcuts. Heading defaults to levels 1 to 6. Restrict it to `[1, 2, 3, 4]`, so `##### ` doesn't create an H5.
- `@tiptap/suggestion` is not installed yet.

### S2: Copy

- `apps/web/i18n/locales/en-UK.json` and `de-DE.json`: add the C4 keys, change the three
  placeholders.
- `apps/docs/src/content/docs/content/documents.mdx` and `tasks.mdx`: PRD section "Docs". Load
  the `docs-writing` skill.

## Wave 2

Starts when S1 is built and the lead has written `components/editor/types.ts`.

### S3: Editor core

- `useRichTextEditor.ts`: implements C2 over the C1 functions. Owns mount/unmount (the
  pattern in today's `useDocumentEditor.ts`), `isLinkFormOpen`, `isImageFormOpen`, the
  `slashMenu` state and the key handler bridge between `SlashCommandHandlers` and
  `setSlashKeyHandler`.
- `RichTextEditor.vue`: C3.
- `EditorLinkForm.vue`, `EditorImageForm.vue`: extracted from
  `features/document/components/EditorMenu.vue`. Read it, don't edit it.
- `RichTextEditor.css`: copy of `features/document/components/DocumentEditor.css`. Don't delete
  the original, S6 does.

### S4: Bubble and table menus

PRD sections 3 and 4.

- `EditorBubbleMenu.vue`: block type dropdown (trigger shows `activeBlockType()`), format
  buttons, link button that swaps the menu content to `EditorLinkForm`. Shows on a non-empty
  text selection, or while `isLinkFormOpen`. Hidden in a code block and on an image.
- `EditorTableMenu.vue`: shows while `isInTable()` and the selection is empty.
- Both `role="toolbar"` with arrow-key navigation. Tooltips with the shortcut, `⌘` on macOS,
  `Ctrl` elsewhere.

### S5: Slash menu

PRD section 5.

- `slash-items.ts`: the item list (id, i18n key, icon, aliases, markdown shortcut) and a pure
  `filterSlashItems(items, query, translate)`.
- `EditorSlashMenu.vue`: renders `controller.slashMenu`, registers its key handler on mount,
  unregisters on unmount. `role="listbox"` with `aria-activedescendant`. After `image`, shows
  `EditorImageForm` at the same position.
- Positioning: reka-ui popper with a virtual anchor from `clientRect`. Focus must stay in the
  editor. If reka-ui can't do that, stop and report. Adding `@floating-ui/vue` is the lead's
  call.

## Wave 3

### S6: Surfaces

PRD section 6.

- `features/document/components/DocumentEditor.vue`, `features/task/components/TaskDescriptionEditor.vue`,
  `features/email/components/EmailComposer.vue`: switch to `useRichTextEditor` and
  `<RichTextEditor>`. Keep their own autosave, export and send logic.
- `pages/tasks/[taskId]/index.vue`: the task save indicator moves to the header.
- Delete `EditorMenu.vue`, `DocumentEditor.css`, `useDocumentEditor.ts`,
  `useTaskDescriptionEditor.ts`, `useEmailComposeEditor.ts`, and the `document.toolbar.*`
  keys in both locales.
- `grep` for any leftover import of the deleted files and the removed C1 exports.

### Lead: integration

- `pnpm check-types`, `pnpm lint`, `pnpm format`.
- Read every slice's Flags first. Check each cross-slice claim on disk.
- Hand Sven the PRD's manual checklist (section "Testing").
- Spec bookkeeping in the same PR: PRD status, `specs/overview.md`, `pnpm specs:index`.
