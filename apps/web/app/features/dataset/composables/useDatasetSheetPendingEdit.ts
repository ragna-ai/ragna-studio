import { useEventListener } from '@vueuse/core';
import { ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import type { DatasetRow } from '~/features/dataset/types';

export interface UseDatasetSheetPendingEditOptions {
  /** Resolves with the id of the created row. */
  addRow: () => Promise<string>;
  rows: MaybeRefOrGetter<DatasetRow[]>;
  keepRowVisible: (rowId: string) => void;
  editCellOfRow: (rowId: string, columnId?: string, typedText?: string) => void;
  commitEditAndMoveDown: () => void;
}

export interface UseDatasetSheetPendingEditResult {
  isAddingRow: Ref<boolean>;
  /** Adds a row, then edits `columnId` of it (or its first data column). */
  addRowAndEdit: (columnId?: string) => Promise<void>;
}

interface PendingTarget {
  rowId: string;
  columnId?: string;
}

function isPrintableKey(event: KeyboardEvent) {
  return (
    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}

/**
 * Adds a row and opens its editor once the row shows up. Keys typed in
 * between are buffered and seed the editor, so fast typing is not lost.
 */
export function useDatasetSheetPendingEdit(
  options: UseDatasetSheetPendingEditOptions,
): UseDatasetSheetPendingEditResult {
  const isAddingRow = ref(false);
  let isPending = false;
  let isCancelled = false;
  let isEnterQueued = false;
  let typedText = '';
  let target: PendingTarget | null = null;

  function clearTyping() {
    typedText = '';
    isEnterQueued = false;
  }

  function finish() {
    isPending = false;
    isCancelled = false;
    target = null;
    clearTyping();
  }

  function handlePendingKeydown(event: KeyboardEvent) {
    if (!isPending || isTextEntryTarget(event.target)) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      isCancelled = true;
      clearTyping();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      isEnterQueued = true;
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      typedText = typedText.slice(0, -1);
    } else if (isPrintableKey(event)) {
      event.preventDefault();
      typedText += event.key;
    }
  }

  useEventListener(document, 'keydown', handlePendingKeydown);
  useEventListener(document, 'pointerdown', clearTyping);

  async function addRowAndEdit(columnId?: string) {
    isAddingRow.value = true;
    isPending = true;
    isCancelled = false;
    clearTyping();
    try {
      const rowId = await options.addRow();
      options.keepRowVisible(rowId);
      target = { rowId, columnId };
    } catch {
      // The create mutation already shows the error toast.
      finish();
    } finally {
      isAddingRow.value = false;
    }
  }

  watch(
    () => toValue(options.rows),
    (rows) => {
      const pending = target;
      if (!pending || !rows.some((row) => row.id === pending.rowId)) {
        return;
      }
      const wasCancelled = isCancelled;
      const shouldCommit = isEnterQueued;
      const text = typedText;
      finish();
      if (wasCancelled) {
        return;
      }
      options.editCellOfRow(pending.rowId, pending.columnId, text);
      if (shouldCommit) {
        options.commitEditAndMoveDown();
      }
    },
    { flush: 'post' },
  );

  return { isAddingRow, addRowAndEdit };
}
