import { nextTick } from 'vue';

/** Focuses the grid's active cell once the DOM has settled, scrolling only as far as needed. */
export function focusActiveSheetCell(grid: HTMLElement | null) {
  nextTick(() => {
    const cell = grid?.querySelector<HTMLElement>(
      '[role="gridcell"][tabindex="0"]',
    );
    if (!cell) {
      return;
    }
    cell.focus({ preventScroll: true });
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
