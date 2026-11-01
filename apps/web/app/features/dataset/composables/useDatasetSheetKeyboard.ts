import type { CellSelectionDirection } from '@tanstack/vue-table';
import {
  computed,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import type {
  SheetCell,
  UseDatasetSheetResult,
} from '~/features/dataset/composables/useDatasetSheet';
import type { DatasetColumn } from '~/features/dataset/types';
import { ROW_NUMBER_COLUMN_ID } from '~/features/dataset/utils/datasetSheetColumns';
import { seedDraftFor } from '~/features/dataset/utils/sheetDraftSeed';
import { focusActiveSheetCell } from '~/features/dataset/utils/focusActiveSheetCell';

export interface UseDatasetSheetKeyboardOptions extends Pick<
  UseDatasetSheetResult,
  | 'table'
  | 'editingCell'
  | 'startEditing'
  | 'commitEdit'
  | 'cancelEdit'
  | 'clearCell'
> {
  gridRef: Ref<HTMLElement | null>;
  columns: MaybeRefOrGetter<DatasetColumn[]>;
  openRowMenu: (rowId: string) => void;
}

export interface UseDatasetSheetKeyboardResult {
  focusedCell: ComputedRef<SheetCell | null>;
  focusActiveCell: () => void;
  /** Starts editing `columnId` of the row, or its first data column. */
  editCellOfRow: (rowId: string, columnId?: string, typedText?: string) => void;
  handleGridFocus: (event: FocusEvent) => void;
  handleCellKeydown: (event: KeyboardEvent) => void;
  handleCommit: (move: CellSelectionDirection | null) => void;
  handleCancel: () => void;
}

const ARROW_DIRECTIONS: Record<string, CellSelectionDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isPrintableKey(event: KeyboardEvent) {
  return (
    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

function isRowMenuKey(event: KeyboardEvent) {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
}

async function runCellUpdate(update: Promise<void>) {
  try {
    await update;
  } catch {
    // The update mutation already shows the error toast.
  }
}

/** Keyboard navigation, edit keys and focus handling for the sheet grid. */
export function useDatasetSheetKeyboard(
  options: UseDatasetSheetKeyboardOptions,
): UseDatasetSheetKeyboardResult {
  const { table } = options;

  const focusedCell = computed<SheetCell | null>(() => {
    const cell = table.getFocusedCell();
    return cell ? { rowId: cell.row.id, columnId: cell.column.id } : null;
  });

  function focusActiveCell() {
    focusActiveSheetCell(options.gridRef.value);
  }

  function firstDataColumnId(): string | undefined {
    return table
      .getVisibleLeafColumns()
      .find((column) => column.id !== ROW_NUMBER_COLUMN_ID)?.id;
  }

  function editCellOfRow(
    rowId: string,
    columnId = firstDataColumnId(),
    typedText = '',
  ) {
    if (!columnId) {
      return;
    }
    table.setFocusedCell(rowId, columnId);
    const columnType = columnTypeOf(columnId);
    options.startEditing(
      { rowId, columnId },
      columnType ? seedDraftFor(columnType, typedText) : undefined,
    );
  }

  /** Only keyboard focus (Tab into the grid) selects the first cell, never a click. */
  function handleGridFocus(event: FocusEvent) {
    const isKeyboardFocus =
      event.target instanceof HTMLElement &&
      event.target.matches(':focus-visible');
    const firstRow = table.getRowModel().rows[0];
    const columnId = firstDataColumnId();
    if (!isKeyboardFocus || !firstRow || !columnId) {
      return;
    }
    table.setFocusedCell(firstRow.id, columnId);
    focusActiveCell();
  }

  function moveFocus(direction: CellSelectionDirection) {
    table.moveCellSelection(direction);
    focusActiveCell();
  }

  /** Returns false at the edge, so Tab can leave the grid. */
  function moveFocusHorizontally(
    from: SheetCell,
    direction: CellSelectionDirection,
  ) {
    table.moveCellSelection(direction);
    const next = table.getFocusedCell();
    if (next?.row.id === from.rowId && next.column.id === from.columnId) {
      return false;
    }
    focusActiveCell();
    return true;
  }

  function columnTypeOf(columnId: string) {
    return toValue(options.columns).find((column) => column.id === columnId)
      ?.type;
  }

  function handleCellKeydown(event: KeyboardEvent) {
    const cell = focusedCell.value;
    const isOnCell =
      event.target instanceof HTMLElement &&
      event.target.getAttribute('role') === 'gridcell';
    if (!cell || !isOnCell || options.editingCell.value) {
      return;
    }

    const arrowDirection = ARROW_DIRECTIONS[event.key];
    if (arrowDirection) {
      event.preventDefault();
      moveFocus(arrowDirection);
      return;
    }

    if (event.key === 'Tab') {
      const moved = moveFocusHorizontally(
        cell,
        event.shiftKey ? 'left' : 'right',
      );
      if (moved) {
        event.preventDefault();
      }
      return;
    }

    if (isRowMenuKey(event)) {
      event.preventDefault();
      options.openRowMenu(cell.rowId);
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      options.startEditing(cell);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      runCellUpdate(options.clearCell(cell));
      return;
    }

    if (isPrintableKey(event)) {
      event.preventDefault();
      const columnType = columnTypeOf(cell.columnId);
      options.startEditing(
        cell,
        columnType ? seedDraftFor(columnType, event.key) : undefined,
      );
    }
  }

  function handleCommit(move: CellSelectionDirection | null) {
    const update = options.commitEdit();
    if (move) {
      table.moveCellSelection(move);
    }
    focusActiveCell();
    runCellUpdate(update);
  }

  function handleCancel() {
    options.cancelEdit();
    focusActiveCell();
  }

  return {
    focusedCell,
    focusActiveCell,
    editCellOfRow,
    handleGridFocus,
    handleCellKeydown,
    handleCommit,
    handleCancel,
  };
}
