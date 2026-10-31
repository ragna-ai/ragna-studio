# Dataset sheet view: a spreadsheet-style grid with sort, filter and display (PRD)

> **Status: implemented** (2026-10-31, PR #252). Issue #248. Extends [datasets.md](../datasets.md).

The dataset grid looks and behaves like a form. Every cell is an always-on input or button, so a
dataset reads as a wall of boxes. This PRD turns the grid into a sheet: plain values, one active
cell, keyboard navigation, and the look shipped with the settings area (#246).

It also adds the view tools every sheet has: sort, filter, and show, hide or resize columns. They
change only what the user sees. Saved rows, row order, agents and export are not affected.

## Problem

- Every cell mounts an input, a popover button or a select button. At the cap of 1,000 rows by 20
  columns that is up to 20,000 interactive controls on one page.
- Long text is hard to scan: text cells are outline buttons capped at a small width.
- There is no keyboard navigation between cells. Editing needs a mouse click per cell.
- Users can't sort, filter, hide or resize columns. Wide agent-written datasets need horizontal
  scrolling with no fixed reference column.
- Row controls (expand, move up, move down, delete) take a leading and a trailing column on every
  row.

## Goals

- A dataset reads like a sheet: row numbers, plain values, column types at a glance.
- Users edit and move between cells with the keyboard alone.
- Users narrow and order what they see without changing the saved data.
- **Success signal:** a 1,000 by 20 dataset opens and scrolls without visible lag, and a user can
  fill a row from the keyboard without touching the mouse.

## Non-goals

- Row virtualization. Issue #249, only if the 1,000 by 20 run shows lag.
- Live "agent is writing" progress and pending cells. Issue #250.
- Grouping rows, formulas, multi-cell selection, copy and paste of ranges, undo and redo.
- Saved or shared views. View settings stay in the user's browser.
- Pinning data columns. Only the row numbers are pinned; user pinning is issue #251.
- Drag and drop for rows or columns. Rows keep move up and move down.
- New column types or column management changes. The column manager stays as it is.

## User stories

Roles: workspace manager or editor (both may edit datasets; "user" below means either).

### US-1 Read a dataset at a glance (P1)

As a user, I want a dataset to read like a sheet, so that I can scan many rows quickly.

- **US-1.1** Given a dataset with rows, when the user opens it, then every row shows its position
  number, every cell shows its value as plain text, select values show as a pill, and every column
  header shows an icon for its type.
- **US-1.2** Given a wide dataset, when the user scrolls sideways or down, then the row numbers stay
  in place sideways, and the header stays in place downwards.
- **US-1.3** Given a dataset, when the user looks at the sheet, then they see its name in the
  sheet's heading bar and the number of rows and columns at its bottom.
- **US-1.4** Given a dataset with no columns, when the user opens it, then they see an empty state
  with an action that opens the column manager.
- **US-1.5** Rule: the grid ends with an add-row row and an add-column column. There are no other
  empty rows or columns, and the sheet is only as wide and tall as its content.

### US-2 Move between cells (P1)

As a user, I want to select a cell and move with the keyboard, so that I can work through a
dataset without the mouse.

- **US-2.1** Given a sheet, when the user clicks a cell, then that cell is marked as active and no
  editor opens.
- **US-2.2** Given an active cell, when the user presses an arrow key, Tab or Shift+Tab, then the
  neighbouring cell becomes active, and the sheet scrolls to keep it visible.
- **US-2.3** Given the active cell on the edge of the sheet, when the user moves past the edge,
  then the active cell stays where it is.

### US-3 Edit a cell (P1)

As a user, I want to edit the active cell in place, so that changing a value is one quick step.

- **US-3.1** Given an active cell, when the user presses Enter, double-clicks or starts typing,
  then an editor for the column's type opens on that cell. Typing replaces the value.
- **US-3.2** Given an open editor, when the user presses Enter, presses Tab or clicks elsewhere,
  then the value is saved and the cell shows it. Shift+Enter adds a line break in a text cell.
- **US-3.3** Given an open editor, when the user presses Escape, then the editor closes and the old
  value stays.
- **US-3.4** Given an active cell, when the user presses Delete or Backspace, then the value is
  cleared and saved.
- **US-3.5** Given a save that the server rejects, when the response arrives, then the cell shows
  its old value and the user sees an error message.

### US-4 Row actions (P1)

As a user, I want row actions on the row number, so that the sheet stays clean but every action
is one hover away.

- **US-4.1** Given a row, when the user hovers its number and opens its menu, then they can
  expand the row, move it up, move it down or delete it.
- **US-4.2** Given the first or the last row, when the user opens its menu, then moving past that
  end is not offered.
- **US-4.3** Given an active sort or filter, when the user opens a row menu, then moving the row
  is not offered, with a hint to clear the sort and filters.
- **US-4.4** Given a sheet, when the user chooses the add-row row at the end of the sheet or the
  add-row button in the sheet's footer, then an empty row appears at the end, the sheet scrolls
  to it, and its first cell is open for typing.
- **US-4.5** Given a row written by a connected app, when the user looks at its number, then a
  marker shows, with the tooltip "Written by a connected app via MCP".

### US-5 Sort (P2)

As a user, I want to sort by a column, so that I can find the highest, newest or first values.

- **US-5.1** Given a sheet, when the user sorts a column ascending or descending, then the rows
  show in that order, and the column header shows the direction.
- **US-5.2** Rule: empty values sort last in both directions.
- **US-5.3** Given a sorted sheet, when the user clears the sort, then the rows show in their
  saved order again, and the saved order never changed.

### US-6 Filter (P2)

As a user, I want to filter rows by column values, so that I only see the rows I care about.

- **US-6.1** Given a sheet, when the user adds a filter on a column, then only matching rows show.
  Conditions fit the type: text contains, number equals, below or above, date on, before or after,
  select is any of.
- **US-6.2** Given several filters, when they are active, then a row shows only if it matches all
  of them.
- **US-6.3** Given filters that match no row, when the sheet renders, then it says that no rows
  match and offers to clear the filters.
- **US-6.4** Given an active filter, when the user looks at the bottom of the sheet, then they see
  how many of the rows match ("12 of 340 rows").
- **US-6.5** Given an active filter, when the user edits or adds a row that no longer matches,
  then the row stays visible until the filters change.

### US-7 Display columns (P2)

As a user, I want to hide, show and resize columns, so that I can focus on the columns I need.

- **US-7.1** Given a sheet, when the user hides a column, then it disappears from the sheet only.
  Its values stay, and agents and export still see it.
- **US-7.2** Given a sheet, when the user drags a column's edge, then the column takes that width.
- **US-7.3** Given a sort, filters, hidden columns or widths, when the user reloads the dataset in
  the same browser, then they are still applied. Another user sees the dataset unchanged.
- **US-7.4** Given a column added after the user hid some columns, when the sheet renders, then
  the new column shows.
- **US-7.5** Rule: export always contains every row and column in saved order.

### US-8 Column type changes (P1)

As a user, I want the sheet to follow a column's type when I change it, so that I can fix a
dataset's structure without losing or hiding data.

- **US-8.1** Given a column whose type the user changes in the column manager, when the change is
  saved, then its cells show and edit as the new type without a reload.
- **US-8.2** Given a value that doesn't fit its column's type (text in a number column, a select
  value no longer in the options), when the sheet renders, then the value shows as stored, with a
  marker and a tooltip saying it doesn't match the column type.
- **US-8.3** Given such a cell, when the user edits it, then the editor for the column's type
  opens empty, the old value shows as a hint, and Escape keeps the old value.
- **US-8.4** Rule: in a sort, values that don't fit sort after fitting values and before empty
  ones. A filter never matches them.
- **US-8.5** Given a saved filter on a column whose type changed, when the sheet renders, then that
  filter is dropped and the other filters stay.

### US-9 Add a column from the sheet (P1)

As a user, I want to add a column right where the columns end, so that I can extend a dataset
without opening the column manager.

- **US-9.1** Given a sheet, when the user chooses the add-column header at the end of the columns
  and enters a name and a type, then the column is saved and appears as the last data column.
- **US-9.2** Given a select type, when the user adds the column, then they enter its options too.
- **US-9.3** Given an empty name, when the user tries to add the column, then nothing is saved and
  the name field shows it is required.
- **US-9.4** Given a dataset at the column limit, when the user looks at the header, then the
  add-column button is disabled, with a hint naming the limit.

## Testing

One Playwright journey per story in `apps/web/e2e/dataset-sheet.spec.ts`, not one test per
criterion. Each journey walks the main path and one unhappy path.

| Story | Journey covers           | Level            |
| ----- | ------------------------ | ---------------- |
| US-1  | US-1.1, US-1.3, US-1.4   | e2e (Playwright) |
| US-2  | US-2.1, US-2.2           | e2e (Playwright) |
| US-3  | US-3.1 to US-3.3, US-3.5 | e2e (Playwright) |
| US-4  | US-4.1, US-4.3, US-4.4   | e2e (Playwright) |
| US-5  | US-5.1, US-5.3           | e2e (Playwright) |
| US-6  | US-6.1, US-6.3, US-6.4   | e2e (Playwright) |
| US-7  | US-7.1, US-7.3           | e2e (Playwright) |
| US-8  | US-8.1, US-8.2           | e2e (Playwright) |
| US-9  | US-9.1, US-9.3           | e2e (Playwright) |

Not tested: layout rules (US-1.2, US-1.5), keyboard edge cases (US-2.3, US-3.4), the sort and
filter details (US-5.2, US-6.2, US-6.5, US-8.3 to US-8.5) and the remaining small criteria. They
are pure functions or visual, and `apps/web` has no unit test runner. Datasets are seeded through
the API. US-3.5 fulfills the row update with a `422` via `page.route`.

## Standards checklist

- **Deletion:** n/a, no stored data changes. Row delete keeps its current behaviour.
- **Retention:** n/a. View settings live in the browser's local storage only.
- **Erasure:** n/a, no personal data stored on the server.
- **Docs:** `content/datasets.mdx` ("Edit rows in the grid" becomes the sheet: keys, row menu,
  sort, filter, display).

## Decisions

**TanStack Table, headless.** Sorting, filtering, column visibility, sizing and pinning come from
`@tanstack/vue-table` (v9 API), already a dependency. Markup, cells and editors stay ours, so the
sheet matches the shared design. The losers: a hand-rolled grid (all that view state by hand) and
a full data grid library such as AG Grid (heavy, its own styling system to fight, and licensing for
the useful parts).

**One editor at a time, no virtualization yet.** Cells render as plain text. Only the active cell
mounts an editor. That removes almost all mounted controls, which is the real cost today. Rows
keep a fixed height, so row virtualization (#249) can be added later with little work. The loser
was virtualizing now: it complicates keyboard navigation, find in page and screen readers for a
gain we haven't measured.

**View settings per browser, not saved views.** Sort, filters, hidden columns and widths are kept
per dataset in local storage. Shared views would need a schema, an API and permission rules for
who may change a view others see. The loser was server-side views, worth their own PRD once users
ask for them.

## Design

See [design.md](./design.md).
