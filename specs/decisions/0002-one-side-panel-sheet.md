# 0002 · One side panel: the Sheet with options

Status: decided (2026-11-10, widths renamed 2026-11-11)

Applies to every panel that opens at the right side of a page in `apps/web`. Code: #327 (supersedes the docked mode
of #326). Follows [0001](./0001-ui-components-reuse-first.md).

## Context

On 2026-11-10 the app and the design had four different right-side panels:

| Panel                                                                            | Width     | Placement                                                     | Header   | Footer   |
| -------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- | -------- | -------- |
| Expanded Markdown field (agent settings, #323)                                   | 720       | over the window incl. the sidebar, flush to the edge, overlay | 56       | none     |
| Workflow detail (design)                                                         | 440       | inside the main panel, full height                            | 52       | 64       |
| Workflow step panel (design)                                                     | 400       | inside the main panel, below the top bar                      | 64       | 64       |
| Code: `WorkflowNodeConfigPanel`, `DatasetColumnManager`, `TaskPropertiesSidebar` | 320 / 288 | docked asides, `border-l`, `p-4`                              | own each | own each |

The expanded field didn't feel like the rest of the redesign (rounded main panel inside an 8 px shell frame).

## How we got there (all 2026-11-10)

1. **One pattern, two modes:** a modal sheet (720, floating card in the shell frame) and a docked panel (400, inside
   the main panel). Placement chosen on an options page: the sheet floats (not flush), docked panels take the full
   height.
2. **Docked looked squeezed** for workflow steps. Research on open-source workflow editors: Dify shows step settings
   as a floating rounded card over the canvas, no overlay, min 400, resizable; Windmill docks a split pane but switches
   to a modal below 1280 px of editor width (our main panel is 1192 at a 1440 window); n8n uses a large modal and is
   testing a right panel; Node-RED, Langflow and Activepieces use right-side panels. Next try: the 720 card floating
   inside the main panel, no overlay.
3. **Too wide, and not like agent settings.** Decision: always the existing Sheet, full height, with configuration
   options; we use shadcn, so the pattern is known.
4. **Header too thin on top** with two lines in a fixed 52 header: the header gets padding instead of a height.

## Decision

Every right-side panel is `ui/sheet` (`Sheet`, `side="right"`). No docked mode, no second placement.

- **Always:** full height inside the shell frame (`inset-y-shell right-shell`), a card like the main panel
  (`rounded-lg border bg-background shadow-popover`), slides in from the right.
- **Options:**

| Option         | Values                                                                                                    | Use                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `size` (width) | `default`: `w-sheet` (576)                                                                                | details and settings: workflow detail and steps; later dataset columns, row details, task properties |
|                | `lg`: `w-sheet-lg` (720)                                                                                  | editing one thing in depth: the expanded Markdown field                                              |
| `modal`        | `true` (default): `bg-overlay`, focus trapped, overlay click / Esc / close closes                         | the page waits: expanded field                                                                       |
|                | `false`: no overlay, the page left of the sheet stays usable; selecting another item switches the content | workflow detail and step panels                                                                      |

- **Anatomy:**
  - Header: no fixed height, `py-4 pr-4 pl-6`, items centred, gap 3 (64 with one line, 72 with a meta line).
    Optional mark (`size-7`), title `text-title-sm`, optional meta line `text-caption text-muted-foreground`,
    optional control after the title (view tabs). Actions right, `gap-1`, ghost `icon` buttons; **close always last**. The header renders the close button itself,
    so it stays centred whatever the header's height.
  - Tabs (optional): `h-10 px-6 gap-5`, active `font-semibold text-foreground` with a 2 px `bg-foreground` bar,
    inactive muted.
  - One `border-b` between the fixed top and the scrolling body: under the tabs, else under the header.
  - Body: `flex-1 overflow-y-auto p-6`, `gap-6`.
  - Footer (optional): `h-16 px-6 gap-2 border-t`, only for the sheet's own actions (Run now, Test this step); main
    action right, quiet or destructive actions left as ghost. None when the content saves with the page (the
    expanded field).
- **Canvas pages:** with a non-modal sheet open, the workflow canvas pans the flow into the part left of it.
- **Not side panels:** the chat history (`SidePanelHost`, a list pane on the left inside the main panel) and the
  notifications popover stay as they are.

Also decided in this session: the Markdown field's **format button is removed** (it was removed in code first: it
added no value and confused). Fields keep only the expand button; the expanded sheet shows the bare editor.

## Alternatives that lost

- **Docked panel inside the main panel (400):** too narrow for step settings next to a 1192 main panel; the canvas
  shrinks.
- **Floating 720 card inside the main panel, below the top bar:** kept the top bar reachable, but was too wide and a
  second placement next to the Sheet.
- **shadcn's default sheet, flush to the window edge:** breaks the 8 px air around the shell.
- **One fixed 52 header (= top bar height):** too thin above a two-line title.

## Consequences

- #327: `SheetHeader` padding instead of `h-topbar`, with the close button inside it; `size` option on
  `SheetContent` with the `--spacing-sheet` and `--spacing-sheet-lg` tokens. `modal=false` needs no code (no overlay
  without modal); workflows use it when they are rebuilt.
- #326 (docked mode) is superseded. `WorkflowNodeConfigPanel`, `DatasetColumnManager`, `TaskPropertiesSidebar` move
  onto the Sheet when their screens are rebuilt.
- With a non-modal sheet open, it covers the right end of the page's top bar (e.g. Publish, Test run in the workflow
  editor); closing the sheet reaches them. Revisit if that gets in the way.

## References

- shadcn Sheet: https://ui.shadcn.com/docs/components/sheet
- Material 3 side sheets: https://m3.material.io/components/side-sheets/overview
- NN/g, Modal & Nonmodal Dialogs: https://www.nngroup.com/articles/modal-nonmodal-dialog/
- Dify workflow node panel: https://github.com/langgenius/dify/blob/main/web/app/components/workflow/nodes/_base/components/workflow-panel/index.tsx
- Windmill step panel placement: https://github.com/windmill-labs/windmill/blob/main/frontend/src/lib/components/flows/panelPlacement.ts
- n8n node details view: https://blog.n8n.io/reduce-context-switching-with-node-details-view-product-update/
