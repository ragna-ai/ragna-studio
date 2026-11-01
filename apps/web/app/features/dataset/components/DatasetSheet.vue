<script setup lang="ts">
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  CircleChevronDownIcon,
  HashIcon,
  PlusIcon,
  TypeIcon,
} from '@lucide/vue';
import type { Header } from '@tanstack/vue-table';
import DatasetSheetAddColumnPopover, {
  type NewColumnInput,
} from '~/features/dataset/components/DatasetSheetAddColumnPopover.vue';
import DatasetSheetCell from '~/features/dataset/components/DatasetSheetCell.vue';
import DatasetSheetAddRow from '~/features/dataset/components/DatasetSheetAddRow.vue';
import DatasetSheetRowMenu from '~/features/dataset/components/DatasetSheetRowMenu.vue';
import DatasetSheetToolbar from '~/features/dataset/components/DatasetSheetToolbar.vue';
import {
  useDatasetSheet,
  type SheetCell,
} from '~/features/dataset/composables/useDatasetSheet';
import { useDatasetSheetKeyboard } from '~/features/dataset/composables/useDatasetSheetKeyboard';
import { useDatasetSheetPendingEdit } from '~/features/dataset/composables/useDatasetSheetPendingEdit';
import type {
  Dataset,
  DatasetColumnType,
  DatasetRow,
} from '~/features/dataset/types';
import {
  ROW_NUMBER_COLUMN_ID,
  type DatasetSheetFeatures,
} from '~/features/dataset/utils/datasetSheetColumns';
import {
  columnStyle,
  ADD_COLUMN_WIDTH_PX,
  pinnedClass,
  type SheetColumn,
} from '~/features/dataset/utils/datasetSheetLayout';
import { parseCellValue } from '~/features/dataset/utils/parseCellValue';
import { cn } from '~/lib/utils';

type SheetHeader = Header<DatasetSheetFeatures, DatasetRow, unknown>;

// Props
interface Props {
  dataset: Dataset;
  rows: DatasetRow[];
  isMovingRow?: boolean;
  expandedRowId?: string | null;
  updateCell: (
    rowId: string,
    columnId: string,
    value: string | number | null,
  ) => Promise<void>;
  /** Resolves with the id of the created row. */
  addRow: () => Promise<string>;
}

const props = withDefaults(defineProps<Props>(), {
  isMovingRow: false,
  expandedRowId: null,
});

// Emits
const emit = defineEmits<{
  (e: 'expand-row', rowId: string): void;
  (e: 'move-row-up', rowId: string): void;
  (e: 'move-row-down', rowId: string): void;
  (e: 'delete-row', rowId: string): void;
  (e: 'add-column', column: NewColumnInput): void;
}>();

const columnManagerOpen = defineModel<boolean>('columnManagerOpen', {
  required: true,
});

// Constants
// The API allows at most this many columns per dataset.
const MAX_COLUMNS_PER_DATASET = 20;

const COLUMN_TYPE_ICONS = {
  text: TypeIcon,
  number: HashIcon,
  date: CalendarIcon,
  select: CircleChevronDownIcon,
} satisfies Record<DatasetColumnType, unknown>;

// Teleported menus, dropdowns and dialogs render outside the grid but belong to it.
const SHEET_OVERLAY_SELECTORS = [
  '[data-reka-popper-content-wrapper]',
  '[role="dialog"]',
  '[role="alertdialog"]',
];

// Refs
const gridRef = ref<HTMLElement | null>(null);
const menuRowId = ref<string | null>(null);

// Composables
const { t } = useI18n();
const {
  table,
  hasActiveView,
  totalRowCount,
  visibleRowCount,
  editingCell,
  draft,
  startEditing,
  commitEdit,
  cancelEdit,
  clearCell,
  keepRowVisible,
  clearView,
} = useDatasetSheet({
  dataset: () => props.dataset,
  rows: () => props.rows,
  onUpdateCell: (rowId, columnId, value) =>
    props.updateCell(rowId, columnId, value),
});
const {
  focusedCell,
  focusActiveCell,
  editCellOfRow,
  handleGridFocus,
  handleCellKeydown,
  handleCommit,
  handleCancel,
} = useDatasetSheetKeyboard({
  table,
  gridRef,
  columns: () => props.dataset.columns,
  editingCell,
  startEditing,
  commitEdit,
  cancelEdit,
  clearCell,
  openRowMenu: (rowId) => {
    menuRowId.value = rowId;
  },
});

const { isAddingRow, addRowAndEdit } = useDatasetSheetPendingEdit({
  addRow: () => props.addRow(),
  rows: () => props.rows,
  keepRowVisible,
  editCellOfRow,
  commitEditAndMoveDown: () => handleCommit('down'),
});
onClickOutside(gridRef, clearActiveCell, { ignore: SHEET_OVERLAY_SELECTORS });

// Computed
const headers = computed(() => table.getHeaderGroups()[0]?.headers ?? []);
const sheetRows = computed(() => table.getRowModel().rows);
const visibleColumns = computed(() => table.getVisibleLeafColumns());
const isFiltered = computed(() => visibleRowCount.value < totalRowCount.value);
const hasColumns = computed(() => props.dataset.columns.length > 0);
const totalWidthStyle = computed(() => ({
  width: `${table.getTotalSize() + ADD_COLUMN_WIDTH_PX}px`,
}));
const scrollPaddingStyle = computed(() => ({
  scrollPaddingLeft: `${table.getStartTotalSize()}px`,
}));
// Functions
/** Deselects the active cell; an open editor has already committed on blur. */
function clearActiveCell() {
  table.resetCellSelection(true);
}

function handleMenuOpenChange(rowId: string, isOpen: boolean) {
  if (isOpen) {
    menuRowId.value = rowId;
    return;
  }
  menuRowId.value = null;
  focusActiveCell();
}

function isEditingCell(cell: SheetCell) {
  return (
    editingCell.value?.rowId === cell.rowId &&
    editingCell.value?.columnId === cell.columnId
  );
}

function headerSortIcon(header: SheetHeader) {
  const direction = header.column.getIsSorted();
  if (!direction) {
    return null;
  }
  return direction === 'asc' ? ArrowUpIcon : ArrowDownIcon;
}

function columnTypeIcon(column: SheetColumn) {
  const type = column.columnDef.meta?.column.type;
  return type ? COLUMN_TYPE_ICONS[type] : null;
}
</script>

<template>
  <TooltipProvider>
    <div
      class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <div class="flex-none border-b border-stone-200">
        <DatasetSheetToolbar :table="table" :title="dataset.name" />
      </div>

      <div
        v-if="!hasColumns"
        class="flex flex-col items-center justify-center gap-3 p-8 text-sm text-stone-500"
      >
        <p>{{ t('dataset.sheet.empty.noColumns') }}</p>
        <Button variant="outline" @click="columnManagerOpen = true">
          {{ t('dataset.sheet.empty.openColumns') }}
        </Button>
      </div>

      <template v-else>
        <div
          ref="gridRef"
          role="grid"
          :aria-rowcount="sheetRows.length + 2"
          :aria-colcount="headers.length"
          :tabindex="focusedCell ? -1 : 0"
          class="min-h-0 flex-1 scroll-pt-9 overflow-auto outline-none"
          :style="scrollPaddingStyle"
          @focus.self="handleGridFocus"
          @keydown="handleCellKeydown"
        >
          <div :style="totalWidthStyle">
            <div
              role="row"
              class="sticky top-0 z-20 flex h-9 flex-none border-b border-stone-200 bg-stone-50"
            >
              <div
                v-for="header in headers"
                :key="header.id"
                role="columnheader"
                :aria-sort="
                  header.column.getIsSorted() === 'asc'
                    ? 'ascending'
                    : header.column.getIsSorted() === 'desc'
                      ? 'descending'
                      : undefined
                "
                :class="
                  cn(
                    'relative flex flex-none items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 text-sm text-stone-600',
                    pinnedClass(header.column),
                    header.column.getCanSort() && 'cursor-pointer select-none',
                  )
                "
                :style="columnStyle(header.column)"
                @click="header.column.getToggleSortingHandler()?.($event)"
              >
                <template v-if="header.column.id === ROW_NUMBER_COLUMN_ID">
                  <span class="w-full text-center text-xs">#</span>
                </template>
                <template v-else>
                  <component
                    :is="columnTypeIcon(header.column)"
                    class="size-4 shrink-0 stroke-1.5 text-stone-500"
                  />
                  <span class="min-w-0 truncate">
                    {{ header.column.columnDef.meta?.column.name }}
                  </span>
                  <component
                    :is="headerSortIcon(header)"
                    v-if="headerSortIcon(header)"
                    class="ml-auto size-3.5 shrink-0 stroke-1.5 text-stone-500"
                  />
                </template>
                <div
                  v-if="header.column.getCanResize()"
                  role="separator"
                  aria-orientation="vertical"
                  :aria-label="
                    t('dataset.sheet.resizeColumn', {
                      column: header.column.columnDef.meta?.column.name,
                    })
                  "
                  class="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-stone-300"
                  :class="{ 'bg-stone-400': header.column.getIsResizing() }"
                  @click.stop
                  @mousedown.stop="header.getResizeHandler()($event)"
                  @touchstart.stop="header.getResizeHandler()($event)"
                />
              </div>
              <div
                role="columnheader"
                class="flex w-11 flex-none items-center justify-center bg-stone-50 hover:bg-stone-100"
              >
                <DatasetSheetAddColumnPopover
                  :disabled="dataset.columns.length >= MAX_COLUMNS_PER_DATASET"
                  :limit="MAX_COLUMNS_PER_DATASET"
                  @add="(column) => emit('add-column', column)"
                />
              </div>
            </div>

            <div
              v-if="sheetRows.length === 0 && totalRowCount > 0"
              class="flex flex-none flex-col items-center gap-3 p-8 text-sm text-stone-500"
            >
              <p>{{ t('dataset.sheet.noMatches') }}</p>
              <Button variant="outline" size="sm" @click="clearView">
                {{ t('dataset.sheet.clearFilters') }}
              </Button>
            </div>

            <div
              v-for="(row, rowIndex) in sheetRows"
              :key="row.id"
              role="row"
              :aria-rowindex="rowIndex + 2"
              class="group/row flex h-9 flex-none border-b border-stone-200"
            >
              <template v-for="cell in row.getVisibleCells()" :key="cell.id">
                <div
                  v-if="cell.column.id === ROW_NUMBER_COLUMN_ID"
                  role="rowheader"
                  :class="
                    cn(
                      'flex flex-none items-center border-r border-stone-200 bg-white group-hover/row:bg-stone-50',
                      pinnedClass(cell.column),
                    )
                  "
                  :style="columnStyle(cell.column)"
                >
                  <DatasetSheetRowMenu
                    :position="rowIndex + 1"
                    :is-mcp-row="row.original.writtenBy === 'mcp'"
                    :is-first="rowIndex === 0"
                    :is-last="rowIndex === sheetRows.length - 1"
                    :has-active-view="hasActiveView"
                    :is-moving-row="isMovingRow"
                    :open="menuRowId === row.id"
                    @update:open="
                      (isOpen) => handleMenuOpenChange(row.id, isOpen)
                    "
                    @expand="emit('expand-row', row.id)"
                    @move-up="emit('move-row-up', row.id)"
                    @move-down="emit('move-row-down', row.id)"
                    @delete="emit('delete-row', row.id)"
                  />
                </div>
                <div
                  v-else-if="cell.column.columnDef.meta"
                  role="gridcell"
                  :aria-selected="cell.getIsFocused()"
                  :tabindex="cell.getTabIndex()"
                  :class="
                    cn(
                      'relative flex flex-none items-center border-r border-stone-200 px-3 text-sm outline-none group-hover/row:bg-stone-50',
                      pinnedClass(cell.column),
                      cell.getIsFocused()
                        ? 'bg-stone-50 ring-1 ring-stone-500 ring-inset'
                        : 'bg-white',
                      isEditingCell({
                        rowId: row.id,
                        columnId: cell.column.id,
                      }) && 'z-40',
                    )
                  "
                  :style="columnStyle(cell.column)"
                  @mousedown="cell.getSelectionStartHandler()($event)"
                  @dblclick="
                    startEditing({ rowId: row.id, columnId: cell.column.id })
                  "
                >
                  <DatasetSheetCell
                    v-model:draft="draft"
                    :column="cell.column.columnDef.meta.column"
                    :value="
                      parseCellValue(
                        cell.column.columnDef.meta.column,
                        row.original.data[cell.column.id],
                      )
                    "
                    :is-editing="
                      isEditingCell({ rowId: row.id, columnId: cell.column.id })
                    "
                    @commit="handleCommit"
                    @cancel="handleCancel"
                    @blur="commitEdit"
                  />
                </div>
              </template>
              <div class="w-11 flex-none bg-stone-50 hover:bg-stone-100" />
            </div>

            <DatasetSheetAddRow
              :columns="visibleColumns"
              :is-adding-row="isAddingRow"
              @add="addRowAndEdit"
            />
          </div>
        </div>

        <div
          class="flex h-10 flex-none items-center justify-between border-t border-stone-200 px-3 text-xs text-stone-500"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-7"
                :disabled="isAddingRow"
                :aria-label="t('dataset.sheet.addRow')"
                @click="addRowAndEdit()"
              >
                <Spinner v-if="isAddingRow" />
                <PlusIcon v-else class="size-4 stroke-1.5 text-stone-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('dataset.sheet.addRow') }}</TooltipContent>
          </Tooltip>
          <span>
            {{
              isFiltered
                ? t('dataset.sheet.count.filtered', {
                    visible: visibleRowCount,
                    total: totalRowCount,
                  })
                : t('dataset.sheet.count.all', {
                    rows: totalRowCount,
                    columns: dataset.columns.length,
                  })
            }}
          </span>
        </div>
      </template>
    </div>
  </TooltipProvider>
</template>
