# Rich text editor: one shared editor with inline controls (PRD)

Status: implemented (2026-10-21, PR #127).

One rich text editor for the whole app, used by documents, the task description and the email
composer. It supports only what markdown (CommonMark + GFM) can store. The fixed toolbar is
replaced by Linear-style inline controls: a bubble menu on selection, a table menu, and a `/`
command menu.

## Problem

**The toolbar scrolls away.** On the task page the toolbar sits inside the scroll container,
above the description. On a long description it scrolls out of view. To format text near the
bottom, the user has to scroll back up.

**Three copies of the same editor.** The engine is shared (`createDocumentEditor()` in
`@repo/editor`), and so is the toolbar (`EditorMenu.vue`). Everything between them is copied:

| Copy                                                    | Lines | Differs by                                     |
| ------------------------------------------------------- | ----- | ---------------------------------------------- |
| `features/document/composables/useDocumentEditor.ts`    | 201   | nothing                                        |
| `features/task/composables/useTaskDescriptionEditor.ts` | 206   | the exported type name                         |
| `features/email/composables/useEmailComposeEditor.ts`   | 224   | `contentType: 'html'`, `getHtml`, `setContent` |

Each feature also wires toolbar, content area and autosave its own way. Any editor change has
to land in three places.

**Controls that don't persist.** Documents and tasks are stored as markdown. Some toolbar
controls have no markdown form, or only a non-standard one:

| Control              | What happens on save                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| Text alignment       | Dropped. Markdown has no alignment. The button looks like it works.              |
| Underline            | Written as `++text++`. Not CommonMark or GFM, other readers show the plus signs. |
| Highlight            | Written as `==text==`. Same problem.                                             |
| Table header column  | Dropped. GFM tables only have a header row.                                      |
| Table header row off | Not possible. A GFM table always has a header row.                               |
| Table column widths  | Dropped (`resizable: true`). GFM has no column widths.                           |

The markdown is also read by agents, MCP clients and exports. Non-standard syntax leaks into
all of them.

## Prior art

| Tool             | Approach                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| Linear, Notion   | No toolbar. Bubble menu on selection, `/` command menu, markdown shortcuts. |
| Jira, Confluence | Sticky toolbar while editing.                                               |
| Google Docs      | Toolbar fixed outside the scroll area (our document editor today).          |
| GitHub comments  | Toolbar above the field, not sticky.                                        |

We follow Linear. Controls next to the cursor beat a toolbar the user has to reach for.

## Goals

- One editor composable and one editor component, used by every rich text surface.
- The editor supports exactly CommonMark + GFM. Nothing the user creates gets lost or mangled
  on save.
- Formatting controls are reachable wherever the cursor is.
- Every block that can be inserted today stays reachable without a toolbar.

## Non-goals

- Drag handles for blocks (Notion's `⋮⋮` handle).
- Image upload from the editor. Image insertion stays URL-based, like today.
- Mentions (`@user`, `#task`). They would reuse the slash menu's suggestion plumbing later.
- Any API or database change. Documents and tasks stay markdown, email stays HTML.
- Plain text fields that aren't rich text today (chat input, agent instructions).

## Decisions

| Decision        | Choice                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One editor**  | One composable and one component replace the three copies. Features keep only their own concerns (autosave, export, sending).                              |
| **Feature set** | CommonMark + GFM only, for every surface. This includes email, even though it is stored as HTML. One feature set, no per-surface variants.                 |
| **Controls**    | Inline (bubble menu, table menu, slash menu). No fixed toolbar.                                                                                            |
| **Block types** | One dropdown in the bubble menu with only Text and Heading 1 to 4. No separate heading buttons. Lists, quote and code block are toggle buttons in the bar. |
| **Email**       | Loses underline and alignment too. Accepted for one feature set.                                                                                           |
| **Mouse users** | No `+` button on empty lines. The placeholder hint ("Type / for commands") is enough. Revisit if users don't find the slash menu.                          |
| **Rollout**     | One PR, built in parallel slices (see Rollout).                                                                                                            |

## Design

### 1. Feature set

**Kept:** paragraph, headings 1 to 4, bold, italic, strikethrough, inline code, link, bulleted
list, numbered list, task list, blockquote, code block (with language), horizontal rule, image
(URL), GFM table, hard break.

**Removed:**

- Text alignment (`TextAlign` extension, `cycleTextOrientation`).
- Underline (`Underline` extension, `formatText('underline')`).
- Highlight (`Highlight` extension, `formatText('highlight')`).
- Table header column (`toggleHeaderColumn`) and header row toggle (`toggleHeaderRow`). New
  tables always get a header row.
- Table column resizing (`resizable: false`).
- Undo/redo buttons. `Mod-z` / `Mod-Shift-z` stay.
- `CharacterCount` and the word count. `showWordCount` is never set by any caller today, so
  this is dead code.

Removing an extension also removes it from the schema. Pasted HTML with `<u>`, `<mark>` or
`style="text-align"` keeps its text but loses that formatting. That is intended.

**Existing content.** Documents and task descriptions saved before this change may contain
`++text++` or `==text==`. Without a parser for them, they would show the raw signs. A small
parse-only extension (`legacy-marks.ts` in `@repo/editor`) reads both syntaxes and returns the
plain text, without a mark. The next save writes clean markdown. No data migration is needed.
Remove the extension once enough time has passed (#165).

Alignment and header columns were never persisted, so there is nothing to migrate.

### 2. One editor

**`useRichTextEditor(options)`** in `apps/web/app/components/editor/`, replacing the three
composables.

```ts
export interface UseRichTextEditorOptions {
  content: string;
  contentType: 'markdown' | 'html';
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
}
```

- Returns one controller with the commands from section 1, plus `getContent()` and
  `setContent()`. `getContent()` returns markdown or HTML, matching `contentType`. This
  replaces `getMarkdown()`, `getHtml()` and the email `setContent()`.
- Email's `getText()` stays, it is needed for the plain text part of the message.

**`<RichTextEditor>`** in the same folder.

- Props: `controller`, plus a `class` for the content area. Each surface keeps its own
  surrounding layout (the document sheet, the task column, the compose box).
- Renders the content area, the bubble menu, the table menu and the slash menu.
- Emits nothing about saving. Autosave stays in the feature components, since documents, tasks
  and email drafts save differently.

The folder is `components/editor/`, not `features/document/`, because three features use it.

### 3. Bubble menu

Appears above a non-empty text selection, also inside a code block. Hidden on an image. Inside a
code block the mark buttons and link are disabled, since code blocks don't allow marks.

| Control       | Command                       | Shortcut      |
| ------------- | ----------------------------- | ------------- |
| Block type ▾  | see below                     | see below     |
| Bold          | `formatText('bold')`          | `Mod-b`       |
| Italic        | `formatText('italic')`        | `Mod-i`       |
| Strikethrough | `formatText('strike')`        | `Mod-Shift-s` |
| Inline code   | `formatText('code')` (new)    | `Mod-e`       |
| Bulleted list | `setBlockType('bulletList')`  | `Mod-Shift-8` |
| Numbered list | `setBlockType('orderedList')` | `Mod-Shift-7` |
| Task list     | `setBlockType('taskList')`    | `Mod-Shift-9` |
| Quote         | `setBlockType('blockquote')`  | `Mod-Shift-b` |
| Code block    | `setBlockType('codeBlock')`   | `Mod-Alt-c`   |
| Link          | link form                     | `Mod-k` (new) |

The list, quote and code block buttons toggle: clicking an active one turns the block back into
text. Separators group the bar: block type, marks, blocks, link.

**Block type dropdown.** There are no separate heading buttons. Like Linear, the first control is
a dropdown. It holds only text and headings. Lists, quote and code block are buttons in the bar
(table above). The trigger shows the current heading level, or "Text" for any other block, so it doubles as a status display. Picking an entry converts the block.

| Entry     | Command                     | Shortcut    |
| --------- | --------------------------- | ----------- |
| Text      | `setBlockType('paragraph')` | `Mod-Alt-0` |
| Heading 1 | `setBlockType('h1')`        | `Mod-Alt-1` |
| Heading 2 | `setBlockType('h2')`        | `Mod-Alt-2` |
| Heading 3 | `setBlockType('h3')`        | `Mod-Alt-3` |
| Heading 4 | `setBlockType('h4')`        | `Mod-Alt-4` |

- The current type is checked in the list. Each entry shows its icon and shortcut.
- The shortcuts are Tiptap's defaults. They need no new code.
- When a selection spans blocks of different types, the trigger reads "Mixed". Picking an
  entry converts all of them.

**Other notes**

- The link form is extracted from `EditorMenu.vue` into `EditorLinkForm.vue`.
- `Mod-k` is new. The `Link` extension has no default shortcut. It opens the link form for the
  current selection.
- Built on Tiptap's `BubbleMenu` from `@tiptap/vue-3/menus`.

### 4. Table menu

A second bubble menu shows while the caret is in a table and nothing is selected. Actions: add
row above/below, delete row, add column left/right, delete column, delete table. The text
bubble menu takes priority when there is a selection inside a cell.

### 5. Slash menu

Typing `/` at the start of a line, or after a space, opens a filtered list. Typing narrows it.
`↑`/`↓` move, `Enter` runs, `Esc` closes and keeps the `/` as text. It does not open inside a
code block or inline code.

| Item          | Command                       | Markdown shortcut |
| ------------- | ----------------------------- | ----------------- |
| Text          | `setBlockType('paragraph')`   | none              |
| Heading 1     | `setBlockType('h1')`          | `# `              |
| Heading 2     | `setBlockType('h2')`          | `## `             |
| Heading 3     | `setBlockType('h3')`          | `### `            |
| Heading 4     | `setBlockType('h4')`          | `#### `           |
| Bulleted list | `setBlockType('bulletList')`  | `- `              |
| Numbered list | `setBlockType('orderedList')` | `1. `             |
| Task list     | `setBlockType('taskList')`    | `[ ] `            |
| Quote         | `setBlockType('blockquote')`  | `> `              |
| Code block    | `setBlockType('codeBlock')`   | ` ``` `           |
| Divider       | `setHorizontalRule()` (new)   | `---`             |
| Table         | `insertTable()`               | none              |
| Image         | image URL form                | none              |

- Each item shows its markdown shortcut, so users learn the faster path.
- Items filter by label and by aliases (`h1`, `ul`, `todo`, `hr`), in both locales.
- `cycleList()` is removed. The slash menu and the block type dropdown both use `setBlockType()`.
- Built on `@tiptap/suggestion` with `char: '/'`. This is a new dependency of `@repo/editor`,
  same version line as the other `@tiptap/*` packages. It must pass the release-age rule
  (`minimumReleaseAge` in `pnpm-workspace.yaml`) and the CI lockfile guard.

### 6. Surfaces

| Surface          | Today                                             | After                                                  |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Document         | toolbar row under the header, save icon in header | `<RichTextEditor>` in the sheet, header unchanged      |
| Task description | toolbar above the editor, save icon next to it    | `<RichTextEditor>`, save icon moves to the page header |
| Email composer   | toolbar above the compose box                     | `<RichTextEditor>`, send bar unchanged                 |

Placeholders get a hint: "Type / for commands" (new i18n keys in `en-UK.json` and
`de-DE.json`).

## Code layout

**`packages/editor`**

- `kit.ts`: drop `TextAlign`, `Underline`, `Highlight`, `CharacterCount`. Set table
  `resizable: false`. Add `SlashCommand`, `LegacyMarks` and the `Mod-k` shortcut.
- `commands.ts`: remove `cycleTextOrientation`, `cycleList`, `toggleHeaderRow`,
  `toggleHeaderColumn`, `getCharacterCount`, `getWordCount`, and the `underline` and
  `highlight` formats, and the heading formats (`h1`, `h2`). Add `setBlockType` and
  `getActiveBlockType` (one code path for the dropdown and the slash menu), `setHorizontalRule`
  and the `code` format. These stay in this package for the existing reason: the `ChainedCommands` augmentations don't reach `apps/web`.
- `slash-command.ts`: `SlashCommand` extension on `@tiptap/suggestion`. It owns trigger
  detection and keyboard handling, and renders nothing. It reports open, query, `clientRect`
  and close through callbacks.
- `legacy-marks.ts`: parse-only `++`/`==` tokenizer (section 1).
- `document-editor.ts`: rename `createDocumentEditor` to `createRichTextEditor`, since it is no
  longer document-specific. Same for `getDocumentMarkdown` and `setDocumentContent`.
- `index.ts`: re-export `BubbleMenu` from `@tiptap/vue-3/menus`, since `apps/web` has no
  `@tiptap` dependency.
- `package.json`: add `@tiptap/suggestion`, drop the removed extension packages, add
  `@floating-ui/dom` (today only a peer of `@tiptap/vue-3`).

**`apps/web/app/components/editor/`** (new)

- `useRichTextEditor.ts`, `RichTextEditor.vue`.
- `EditorBubbleMenu.vue`, `EditorTableMenu.vue`, `EditorSlashMenu.vue`.
- `EditorLinkForm.vue`, `EditorImageForm.vue` (extracted from `EditorMenu.vue`).
- `RichTextEditor.css`: the typography from `features/document/components/DocumentEditor.css`,
  moved here.

The slash menu should position with reka-ui's popper and a virtual anchor built from
`clientRect`, so `apps/web` needs no new dependency. Focus must stay in the editor (no
auto-focus, no focus trap). If reka-ui can't do that cleanly, add `@floating-ui/vue` to
`apps/web` (already in the lockfile through reka-ui).

**Deleted**

- `features/document/components/EditorMenu.vue`.
- `features/document/composables/useDocumentEditor.ts`.
- `features/task/composables/useTaskDescriptionEditor.ts`.
- `features/email/composables/useEmailComposeEditor.ts`.

**Changed**

- `DocumentEditor.vue`, `TaskDescriptionEditor.vue`, `EmailComposer.vue`: use
  `useRichTextEditor` and `<RichTextEditor>`, keep their own autosave and layout.
- `pages/tasks/[taskId]/index.vue`: renders the task save indicator in the header.

## Rollout

One PR. A split would ship throwaway work: an intermediate PR would edit `EditorMenu.vue`, and
the next would delete it. The build runs as parallel agent slices, see
[slices.md](./slices.md). Each wave is a natural commit point.

## Accessibility

- Bubble menus use `role="toolbar"` with arrow-key navigation.
- The slash menu uses `role="listbox"` with `aria-activedescendant`. Focus stays in the
  editor, so typing keeps filtering.
- `Esc` closes any menu.
- Buttons keep their `aria-label`s and get tooltips with the shortcut, for example "Bold (⌘B)".
  `⌘` on macOS, `Ctrl` elsewhere.
- Everything in the menus is also reachable by keyboard or markdown shortcut.

## Testing

Neither `apps/web` nor `packages/editor` has a test runner today. Adding one is out of scope,
so everything is verified by hand, on all three surfaces.

Content checks:

- Markdown round-trip for every kept node and mark.
- `++text++` and `==text==` load as plain text and save without the signs.
- Pasted HTML with underline, highlight and alignment loses the formatting, keeps the text.

UI checks:

- Format text at the bottom of a long description without scrolling.
- Every slash item inserts the right block and survives a reload.
- Table actions work from the table menu.
- `Mod-k` adds, edits and removes a link.
- Slash menu filtering in English and German. `Esc` keeps the `/`. `/` inside a word or a code
  block does not open the menu.
- An email with a table, a list and a link arrives correctly formatted.

## Docs

- `apps/docs/src/content/docs/content/documents.mdx`: replace the toolbar list with the
  bubble menu, the `/` menu and the shortcuts. Drop underline, highlight, alignment and undo/redo.
  The page also says "A word count shows at the bottom", which the app doesn't do today. Remove
  that sentence.
- `apps/docs/src/content/docs/content/tasks.mdx`: same, the description uses the shared editor.
