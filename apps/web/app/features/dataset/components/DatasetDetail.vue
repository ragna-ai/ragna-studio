<script setup lang="ts">
import type { NewColumnInput } from '~/features/dataset/components/DatasetSheetAddColumnPopover.vue';
import DatasetColumnManager from '~/features/dataset/components/DatasetColumnManager.vue';
import DatasetRowPanel from '~/features/dataset/components/DatasetRowPanel.vue';
import DatasetSettingsSheet, {
  type DatasetSettingsValue,
} from '~/features/dataset/components/DatasetSettingsSheet.vue';
import DatasetSheet from '~/features/dataset/components/DatasetSheet.vue';
import {
  useCreateDatasetRow,
  useDeleteDatasetRow,
  useMoveDatasetRow,
  useUpdateDataset,
  useUpdateDatasetRow,
} from '~/features/dataset/composables/useDatasetApi';
import type {
  Dataset,
  DatasetColumn,
  DatasetRow,
} from '~/features/dataset/types';

interface Props {
  dataset: Dataset;
  rows: DatasetRow[];
}

const props = defineProps<Props>();

// The "Columns" and settings toggle buttons live in the page's own header,
// alongside the breadcrumb (which has to render before `dataset` has
// loaded), so their open state is owned by the page and passed down here.
const columnManagerOpen = defineModel<boolean>('columnManagerOpen', {
  required: true,
});
const settingsOpen = defineModel<boolean>('settingsOpen', { required: true });

// The row panel, by contrast, is only ever opened from inside the grid (the
// expand button on a row), so its selection lives here, next to the grid it
// belongs to — same split as WorkflowEditor's local `selectedNodeId`.
const selectedRowId = ref<string | null>(null);
const selectedRow = computed(
  () => props.rows.find((row) => row.id === selectedRowId.value) ?? null,
);

// A row disappearing from under the panel (deleted elsewhere, e.g. a
// concurrent edit) closes it gracefully instead of showing a stale/blank form.
watch(
  () => props.rows,
  (rows) => {
    if (
      selectedRowId.value &&
      !rows.some((row) => row.id === selectedRowId.value)
    ) {
      selectedRowId.value = null;
    }
  },
);

// Composables
const { t } = useI18n();
// A stable computed ref (not a plain getter) so vue-query's queryKey/queryFn
// reactivity tracking works the same way it does for every other detail
// composable in this app (see useGetWorkflow/useGetDataset). The dataset
// already carries its own workspaceId, so there's no need for a separate prop.
const datasetId = computed(() => props.dataset.id);
const { mutateAsync: updateDataset, isPending: isUpdatingDataset } =
  useUpdateDataset();
const { mutateAsync: createRow } = useCreateDatasetRow(datasetId);
const { mutateAsync: updateRow } = useUpdateDatasetRow(datasetId);
const { mutateAsync: deleteRow } = useDeleteDatasetRow(datasetId);
const { mutate: moveRow, isPending: isMovingRow } =
  useMoveDatasetRow(datasetId);
const { confirm } = useConfirmDialog();

// Functions
async function handleSaveColumns(columns: DatasetColumn[]) {
  await updateDataset({ datasetId: props.dataset.id, columns });
  columnManagerOpen.value = false;
}

// A cleared description is persisted as null, not an empty string.
async function handleSaveSettings(value: DatasetSettingsValue) {
  await updateDataset({
    datasetId: props.dataset.id,
    name: value.name,
    description: value.description || null,
  });
  settingsOpen.value = false;
}

async function handleAddColumn(column: NewColumnInput) {
  const newColumn: DatasetColumn = {
    id: crypto.randomUUID(),
    name: column.name,
    type: column.type,
    options: column.options,
  };
  await updateDataset({
    datasetId: props.dataset.id,
    columns: props.dataset.columns.concat(newColumn),
  });
}

async function handleAddRow() {
  const { row } = await createRow({});
  return row.id;
}

// Shared by both the grid's inline cells and the row panel's fields: same
// mutation, same partial-update semantics.
async function handleUpdateCell(
  rowId: string,
  columnId: string,
  value: string | number | null,
) {
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
}

// Moving up means "place this row after the one two positions above it"
// (or at the top, once fewer than two rows separate it from the top).
function handleMoveRowUp(rowId: string) {
  const index = props.rows.findIndex((row) => row.id === rowId);
  if (index <= 0) {
    return;
  }
  const afterRowId = index >= 2 ? (props.rows[index - 2]?.id ?? null) : null;
  moveRow({ rowId, afterRowId });
}

// Moving down means "place this row after the one currently below it".
function handleMoveRowDown(rowId: string) {
  const index = props.rows.findIndex((row) => row.id === rowId);
  if (index === -1 || index >= props.rows.length - 1) {
    return;
  }
  const afterRowId = props.rows[index + 1]?.id ?? null;
  moveRow({ rowId, afterRowId });
}

async function handleDeleteRow(rowId: string) {
  const confirmed = await confirm({
    title: t('dataset.grid.deleteRowConfirm.title'),
    message: t('dataset.grid.deleteRowConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
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
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-page pt-6">
    <DatasetSheet
      v-model:column-manager-open="columnManagerOpen"
      :dataset="dataset"
      :rows="rows"
      :is-moving-row="isMovingRow"
      :expanded-row-id="selectedRowId"
      :update-cell="handleUpdateCell"
      :add-row="handleAddRow"
      @add-column="handleAddColumn"
      @delete-row="handleDeleteRow"
      @expand-row="handleExpandRow"
      @move-row-up="handleMoveRowUp"
      @move-row-down="handleMoveRowDown"
    />
  </div>

  <DatasetColumnManager
    v-model:open="columnManagerOpen"
    :columns="dataset.columns"
    :is-saving="isUpdatingDataset"
    @save="handleSaveColumns"
  />

  <DatasetSettingsSheet
    v-model:open="settingsOpen"
    :name="dataset.name"
    :description="dataset.description ?? ''"
    :is-saving="isUpdatingDataset"
    @save="handleSaveSettings"
  />

  <DatasetRowPanel
    v-if="selectedRow"
    :key="selectedRow.id"
    :columns="dataset.columns"
    :row="selectedRow"
    @update-cell="handleUpdateCell"
    @delete="handleDeleteRow"
    @close="selectedRowId = null"
  />
</template>
