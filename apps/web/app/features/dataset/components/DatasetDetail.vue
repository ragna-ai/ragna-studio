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

// The "Columns" and settings toggle buttons live in the page's own header,
// alongside the breadcrumb (which has to render before `dataset` has
// loaded), so their open state is owned by the page and passed down here.
const columnManagerOpen = defineModel<boolean>('columnManagerOpen', { required: true });
const settingsOpen = defineModel<boolean>('settingsOpen', { required: true });

// The row panel, by contrast, is only ever opened from inside the grid (the
// expand button on a row), so its selection lives here, next to the grid it
// belongs to — same split as WorkflowEditor's local `selectedNodeId`.
const selectedRowId = ref<string | null>(null);
const selectedRow = computed(
  () => props.rows.find((row) => row.id === selectedRowId.value) ?? null,
);

// The settings panel, the column manager, and the row panel are all asides
// on this page; only one shows at a time. Opening one (from the page's
// header buttons) closes the others...
watch(columnManagerOpen, (isOpen) => {
  if (isOpen) {
    settingsOpen.value = false;
    selectedRowId.value = null;
  }
});

watch(settingsOpen, (isOpen) => {
  if (isOpen) {
    columnManagerOpen.value = false;
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
// A stable computed ref (not a plain getter) so vue-query's queryKey/queryFn
// reactivity tracking works the same way it does for every other detail
// composable in this app (see useGetWorkflow/useGetDataset). The dataset
// already carries its own workspaceId, so there's no need for a separate prop.
const datasetId = computed(() => props.dataset.id);
const workspaceId = computed(() => props.dataset.workspaceId);
const { mutateAsync: updateDataset, isPending: isSavingColumns } = useUpdateDataset(workspaceId);
const { mutateAsync: createRow, isPending: isAddingRow } = useCreateDatasetRow(
  workspaceId,
  datasetId,
);
const { mutateAsync: updateRow } = useUpdateDatasetRow(workspaceId, datasetId);
const { mutateAsync: deleteRow } = useDeleteDatasetRow(workspaceId, datasetId);
const { confirm } = useConfirmDialog();

// Functions
async function handleSaveColumns(columns: DatasetColumn[]) {
  await updateDataset({ datasetId: props.dataset.id, columns });
  columnManagerOpen.value = false;
}

// A cleared description is persisted as null, not an empty string.
async function handleSaveSettings(value: { name: string; description: string }) {
  await updateDataset({
    datasetId: props.dataset.id,
    name: value.name,
    description: value.description || null,
  });
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
  // ...and opening the row panel (from the grid) closes the header asides.
  columnManagerOpen.value = false;
  settingsOpen.value = false;
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

    <SettingsAside
      v-if="settingsOpen"
      :name="dataset.name"
      :description="dataset.description ?? ''"
      :title="t('dataset.detail.settings')"
      :name-label="t('dataset.detail.nameLabel')"
      :description-label="t('dataset.detail.descriptionLabel')"
      :description-placeholder="t('dataset.detail.descriptionPlaceholder')"
      :close-label="t('dataset.detail.closeSettings')"
      @save="handleSaveSettings"
      @close="settingsOpen = false"
    />
    <DatasetColumnManager
      v-else-if="columnManagerOpen"
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
