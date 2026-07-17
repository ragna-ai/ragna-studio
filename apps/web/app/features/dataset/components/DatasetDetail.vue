<script setup lang="ts">
import DatasetColumnManager from '~/features/dataset/components/DatasetColumnManager.vue';
import DatasetGrid from '~/features/dataset/components/DatasetGrid.vue';
import DatasetRowPanel from '~/features/dataset/components/DatasetRowPanel.vue';
import {
  useCreateDatasetRow,
  useDeleteDatasetRow,
  useUpdateDataset,
  useUpdateDatasetRow,
} from '~/features/dataset/composables/useDatasetApi';
import type { Dataset, DatasetColumn, DatasetRow } from '~/features/dataset/types';

interface Props {
  dataset: Dataset;
  rows: DatasetRow[];
}

const props = defineProps<Props>();

// The "Columns" toggle button lives in the page's own header, alongside the
// breadcrumb (which has to render before `dataset` has loaded), so its open
// state is owned by the page and passed down here.
const columnManagerOpen = defineModel<boolean>('columnManagerOpen', { required: true });

// The row panel, by contrast, is only ever opened from inside the grid (the
// expand button on a row), so its selection lives here, next to the grid it
// belongs to — same split as WorkflowEditor's local `selectedNodeId`.
const selectedRowId = ref<string | null>(null);
const selectedRow = computed(
  () => props.rows.find((row) => row.id === selectedRowId.value) ?? null,
);

// The column manager and the row panel are both asides on this page; only
// one shows at a time. Opening the column manager (from the page's header
// button) closes the row panel...
watch(columnManagerOpen, (isOpen) => {
  if (isOpen) {
    selectedRowId.value = null;
  }
});

// ...and a row disappearing from under the panel (deleted elsewhere, e.g. a
// concurrent edit) closes it gracefully instead of showing a stale/blank form.
watch(
  () => props.rows,
  (rows) => {
    if (selectedRowId.value && !rows.some((row) => row.id === selectedRowId.value)) {
      selectedRowId.value = null;
    }
  },
);

// Composables
const { t } = useI18n();
const { mutateAsync: updateDataset, isPending: isSavingColumns } = useUpdateDataset();
// A stable computed ref (not a plain getter) so vue-query's queryKey/queryFn
// reactivity tracking works the same way it does for every other detail
// composable in this app (see useGetWorkflow/useGetDataset).
const datasetId = computed(() => props.dataset.id);
const { mutateAsync: createRow, isPending: isAddingRow } = useCreateDatasetRow(datasetId);
const { mutateAsync: updateRow } = useUpdateDatasetRow(datasetId);
const { mutateAsync: deleteRow } = useDeleteDatasetRow(datasetId);
const { confirm } = useConfirmDialog();

// Functions
async function handleSaveColumns(columns: DatasetColumn[]) {
  await updateDataset({ datasetId: props.dataset.id, columns });
  columnManagerOpen.value = false;
}

async function handleAddRow() {
  await createRow({});
}

// Shared by both the grid's inline cells and the row panel's fields: same
// mutation, same partial-update semantics.
async function handleUpdateCell(rowId: string, columnId: string, value: string | number | null) {
  await updateRow({ rowId, data: { [columnId]: value } });
}

// The expand button is a toggle: clicking it on the already-open row closes
// the panel; on any other row it switches the panel to that row.
function handleExpandRow(rowId: string) {
  if (selectedRowId.value === rowId) {
    selectedRowId.value = null;
    return;
  }
  selectedRowId.value = rowId;
  // ...and opening the row panel (from the grid) closes the column manager.
  columnManagerOpen.value = false;
}

async function handleDeleteRow(rowId: string) {
  const confirmed = await confirm({
    title: t('dataset.grid.deleteRowConfirm.title'),
    message: t('dataset.grid.deleteRowConfirm.message'),
    confirmLabel: t('dataset.grid.deleteRowConfirm.confirm'),
    cancelLabel: t('dataset.grid.deleteRowConfirm.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteRow(rowId);
  if (selectedRowId.value === rowId) {
    selectedRowId.value = null;
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <div class="min-w-0 flex-1 overflow-y-auto p-4">
      <DatasetGrid
        :columns="dataset.columns"
        :rows="rows"
        :is-adding-row="isAddingRow"
        :expanded-row-id="selectedRowId"
        @update-cell="handleUpdateCell"
        @add-row="handleAddRow"
        @delete-row="handleDeleteRow"
        @expand-row="handleExpandRow"
      />
    </div>

    <DatasetColumnManager
      v-if="columnManagerOpen"
      :columns="dataset.columns"
      :is-saving="isSavingColumns"
      @save="handleSaveColumns"
      @close="columnManagerOpen = false"
    />
    <DatasetRowPanel
      v-else-if="selectedRow"
      :key="selectedRow.id"
      :columns="dataset.columns"
      :row="selectedRow"
      @update-cell="handleUpdateCell"
      @delete="handleDeleteRow"
      @close="selectedRowId = null"
    />
  </div>
</template>
