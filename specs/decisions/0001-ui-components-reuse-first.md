# 0001 · UI components: reuse first, own deliberately

Status: decided (2026-11-10)

Applies to `apps/web`: every UI piece the design or the code adds or changes. Found while designing the side panel
([0002](./0002-one-side-panel-sheet.md)), which took four rounds before it became the Sheet the code already had.

## Context

- `apps/web` builds on two copy-in libraries: **shadcn-vue** (`app/components/ui/*`, on reka-ui) and **ai-elements**
  (`app/components/ai-elements/*`: chat `message`, `prompt-input`, `tool`, `reasoning`, `code-block`; workflow canvas
  `canvas`, `node`, `edge`, `connection`, `controls`, `panel`, `toolbar` on Vue Flow).
- Both are owned copies. Upstream changes are almost never pulled.
- The code already adapts them: `ui/sheet` became a floating card without a built-in close (#323), `ui/button` and
  `ui/badge` got app sizes and variants, `ui/select`, `ui/dropdown-menu`, `ui/tabs` and `ui/table` follow the design
  spec (#319).
- The design had drawn patterns from scratch (a docked panel, a floating card inside the main panel) before reaching
  for the existing Sheet. A first draft of this rule ("shadcn first") was too strict: it ruled out the adaptations the
  code already makes.

## Decision

For every UI piece, answer in this order and write the answer into the design handoff:

1. **Should it be a reusable component?** Yes if it's used in two or more places (or soon will be), has states (hover,
   open, error, loading) or carries behaviour worth centralising (focus, keyboard, Esc, outside click, a11y).
   Otherwise it's a composition on the page.
2. **Is there a base?** shadcn-vue, then ai-elements, then reka-ui. Read the code's copy in `app/components/ui/` or
   `app/components/ai-elements/`, not only the upstream docs: it may already be changed.
3. **Pick the lowest adaptation level that works:**

| Level | What | When | Example |
| --- | --- | --- | --- |
| 1 | Tokens only | only colour, radius, shadow, spacing | `--overlay`, `rounded-lg` |
| 2 | A variant, size or prop on the base | the change is an option, not a new look | Button `icon-xs`, Sheet `w-sheet-sm`, `modal` |
| 3 | Change the base's default | the change applies to every use, or a wrapper would mostly override the base | `SheetContent` as a floating card in the shell frame |
| 4 | Wrapper | one context, or a domain composition with its own props | `ViewSwitcher` (Tabs), `ConfirmDialog`, `StatusPill` |
| 5 | Own component in the same style | no base fits | data grid cells, agent mark, workflow node if ai-elements' `node` doesn't fit |

Rules around it:

- **Design proposes the level, the coding agent decides.** The coding agent sees the code and the cost.
- **Change the base (3) rather than fight it with a wrapper (4)** when the wrapper would only use a small part of the
  base and override the rest. Upstream is rarely pulled, so a changed base costs little.
- **Names follow the base.** Design components and their properties are named after the base and the code's props
  (`Sheet` with `size`, `modal`; `Button` with `variant`, `size`), own components after their code name.
- **Paddings never below the base's defaults** unless argued (e.g. shadcn's `SheetHeader` `p-4`).
- **New own components** (level 5) follow the bases' conventions: cva variants, `data-slot`, reka-ui for behaviour.

## Alternatives that lost

- **"shadcn first", change bases only through tokens and wrappers.** Keeps upstream parity we don't use, and makes
  wrappers fight their base (overriding most classes).
- **Design each pattern freely, map to code later.** Produced four side panel rounds in one day and patterns the code
  would have had to build from scratch.

## Consequences

- Design handoffs name the base and the level for every new or changed piece.
- Recommended, not yet done: changed base files say so in a header comment ("Changed from shadcn-vue: floating card,
  no built-in close"), so a later `shadcn-vue add` doesn't silently overwrite them.
- Missing design components are built in order of use in the code: Spinner, Tooltip, Dialog, Separator, Skeleton,
  Popover, Collapsible, Alert, Avatar, Card; then Command, Slider, Date picker, Alert dialog, Toast; and the
  ai-elements pieces the chat and workflow screens draw today (message, prompt input, tool, reasoning, node, edge,
  controls).
