<script setup lang="ts">
import { FilterIcon, PlusIcon, XIcon } from '@lucide/vue';
import type { DatasetColumnType } from '~/features/dataset/types';
import type { DatasetSheetTable } from '~/features/dataset/composables/useDatasetSheet';
import {
  filterOpsFor,
  type DatasetFilterOp,
  datasetSheetFilterSchema,
  type DatasetSheetFilter,
} from '~/features/dataset/utils/datasetSheetColumns';
import {
  getSheetDataColumns,
  type SheetDataColumn,
} from '~/features/dataset/utils/datasetSheetDataColumns';

/** A filter being edited. Only complete rows reach the table. */
interface FilterDraft {
  key: number;
  columnId: string;
  op: DatasetFilterOp;
  value: string | string[];
}

const props = defineProps<{ table: DatasetSheetTable }>();

const { t } = useI18n();

// Refs
const drafts = ref<FilterDraft[]>([]);
let nextDraftKey = 0;

// Computed
const dataColumns = computed(() => getSheetDataColumns(props.table));
const activeFilterCount = computed(
  () => props.table.atoms.columnFilters.get().length,
);
const freeColumns = computed(() => {
  const usedIds = new Set(drafts.value.map((draft) => draft.columnId));
  return dataColumns.value.filter(
    ({ datasetColumn }) => !usedIds.has(datasetColumn.id),
  );
});

// Functions
function findDataColumn(columnId: string): SheetDataColumn | undefined {
  return dataColumns.value.find(
    ({ datasetColumn }) => datasetColumn.id === columnId,
  );
}

function opsFor(draft: FilterDraft): DatasetFilterOp[] {
  return filterOpsFor(
    findDataColumn(draft.columnId)?.datasetColumn.type ?? 'text',
  );
}

const INPUT_TYPE_BY_COLUMN_TYPE: Partial<Record<DatasetColumnType, string>> = {
  number: 'number',
  date: 'date',
};

function inputTypeFor(draft: FilterDraft) {
  const type = findDataColumn(draft.columnId)?.datasetColumn.type;
  return (type && INPUT_TYPE_BY_COLUMN_TYPE[type]) ?? 'text';
}

function emptyValueFor(type: SheetDataColumn['datasetColumn']['type']) {
  return type === 'select' ? [] : '';
}

function toDraft(columnId: string, filter: DatasetSheetFilter): FilterDraft {
  return {
    key: nextDraftKey++,
    columnId,
    op: filter.op,
    value: Array.isArray(filter.value) ? filter.value : String(filter.value),
  };
}

function loadDraftsFromTable() {
  drafts.value = props.table.atoms.columnFilters.get().flatMap((filter) => {
    const parsed = datasetSheetFilterSchema.safeParse(filter.value);
    return parsed.success ? [toDraft(filter.id, parsed.data)] : [];
  });
}

function toFilter(draft: FilterDraft): DatasetSheetFilter | undefined {
  const dataColumn = findDataColumn(draft.columnId);
  if (!dataColumn || draft.value.length === 0) {
    return undefined;
  }
  const { type } = dataColumn.datasetColumn;
  return {
    columnType: type,
    op: draft.op,
    value: type === 'number' ? Number(draft.value) : draft.value,
  };
}

function applyDrafts() {
  const filtersByColumnId = new Map(
    drafts.value.map((draft) => [draft.columnId, toFilter(draft)]),
  );
  dataColumns.value.forEach(({ tableColumn, datasetColumn }) => {
    tableColumn.setFilterValue(filtersByColumnId.get(datasetColumn.id));
  });
}

function addDraft() {
  const dataColumn = freeColumns.value[0];
  if (!dataColumn) {
    return;
  }
  const { id, type } = dataColumn.datasetColumn;
  drafts.value.push({
    key: nextDraftKey++,
    columnId: id,
    op: filterOpsFor(type)[0] ?? 'contains',
    value: emptyValueFor(type),
  });
}

function removeDraft(draft: FilterDraft) {
  drafts.value = drafts.value.filter((item) => item.key !== draft.key);
  applyDrafts();
}

function changeColumn(draft: FilterDraft, columnId: string) {
  const dataColumn = findDataColumn(columnId);
  if (!dataColumn) {
    return;
  }
  const { type } = dataColumn.datasetColumn;
  draft.columnId = columnId;
  draft.op = filterOpsFor(type)[0] ?? 'contains';
  draft.value = emptyValueFor(type);
  applyDrafts();
}

function changeOp(draft: FilterDraft, op: string) {
  const validOp = opsFor(draft).find((candidate) => candidate === op);
  if (!validOp) {
    return;
  }
  draft.op = validOp;
  applyDrafts();
}

function changeValue(draft: FilterDraft, value: string) {
  draft.value = value;
  applyDrafts();
}

function toggleOption(draft: FilterDraft, option: string, checked: boolean) {
  const selected = Array.isArray(draft.value) ? draft.value : [];
  draft.value = checked
    ? selected.concat(option)
    : selected.filter((item) => item !== option);
  applyDrafts();
}

function clearFilters() {
  drafts.value = [];
  applyDrafts();
}

function handleOpenChange(open: boolean) {
  if (open) {
    loadDraftsFromTable();
  }
}
</script>

<template>
  <Popover @update:open="handleOpenChange">
    <PopoverTrigger as-child>
      <Button variant="ghost" size="sm">
        <FilterIcon class="size-4 stroke-1.5 text-stone-500" />
        {{ t('dataset.sheet.toolbar.filter') }}
        <Badge v-if="activeFilterCount > 0" variant="secondary">
          {{ activeFilterCount }}
        </Badge>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="flex w-[34rem] flex-col gap-3 p-3">
      <div
        v-for="draft in drafts"
        :key="draft.key"
        class="flex flex-col gap-2 rounded-md border p-2"
      >
        <div class="flex items-center gap-2">
          <Select
            :model-value="draft.columnId"
            @update:model-value="(value) => changeColumn(draft, String(value))"
          >
            <SelectTrigger class="h-8 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="{ datasetColumn } in dataColumns"
                :key="datasetColumn.id"
                :value="datasetColumn.id"
                :disabled="
                  datasetColumn.id !== draft.columnId &&
                  !freeColumns.some(
                    (free) => free.datasetColumn.id === datasetColumn.id,
                  )
                "
              >
                {{ datasetColumn.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            :model-value="draft.op"
            @update:model-value="(value) => changeOp(draft, String(value))"
          >
            <SelectTrigger class="h-8 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="op in opsFor(draft)" :key="op" :value="op">
                {{ t(`dataset.sheet.filter.op.${op}`) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 shrink-0"
            :aria-label="t('dataset.sheet.filter.remove')"
            @click="removeDraft(draft)"
          >
            <XIcon class="size-4 stroke-1.5 text-stone-500" />
          </Button>
        </div>
        <div
          v-if="Array.isArray(draft.value)"
          class="flex flex-wrap gap-x-4 gap-y-1"
        >
          <label
            v-for="option in findDataColumn(draft.columnId)?.datasetColumn
              .options ?? []"
            :key="option"
            class="flex items-center gap-2 text-sm"
          >
            <Checkbox
              :model-value="draft.value.includes(option)"
              @update:model-value="
                (checked) => toggleOption(draft, option, checked === true)
              "
            />
            {{ option }}
          </label>
        </div>
        <Input
          v-else
          class="h-8"
          :type="inputTypeFor(draft)"
          :model-value="draft.value"
          :placeholder="t('dataset.sheet.filter.value')"
          @update:model-value="(value) => changeValue(draft, String(value))"
        />
      </div>
      <div class="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          :disabled="freeColumns.length === 0"
          @click="addDraft"
        >
          <PlusIcon class="size-4 stroke-1.5 text-stone-500" />
          {{ t('dataset.sheet.filter.add') }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :disabled="drafts.length === 0"
          @click="clearFilters"
        >
          {{ t('dataset.sheet.clearFilters') }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
