<script setup lang="ts">
import { DatabaseIcon, Trash2Icon } from '@lucide/vue';
import type { DatasetListItem } from '~/features/dataset/types';
import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';

interface Props {
  datasets: DatasetListItem[];
  meta?: { totalCount: number };
  // Only shown in the "All items" view (docs/datasets.md): a single
  // workspace or Unassigned already implies the workspace.
  showWorkspaceColumn?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showWorkspaceColumn: false,
});

const emit = defineEmits<{
  (e: 'delete-dataset', datasetId: string): void;
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();
const { data: workspacesData } = useGetWorkspaces();

// Computed
const workspaceNameById = computed<Record<string, string>>(() => {
  const entries = workspacesData.value?.workspaces ?? [];
  return Object.fromEntries(entries.map((workspace) => [workspace.id, workspace.name]));
});

function workspaceName(workspaceId?: string | null): string {
  if (!workspaceId) {
    return t('workspace.switcher.unassigned');
  }
  return workspaceNameById.value[workspaceId] ?? t('workspace.switcher.unassigned');
}

const columnCount = computed(() => (props.showWorkspaceColumn ? 7 : 6));
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>&nbsp;</TableHead>
        <TableHead>{{ t('dataset.list.table.name') }}</TableHead>
        <TableHead>{{ t('dataset.list.table.origin') }}</TableHead>
        <TableHead>{{ t('dataset.list.table.rows') }}</TableHead>
        <TableHead v-if="showWorkspaceColumn">
          {{ t('dataset.list.table.workspace') }}
        </TableHead>
        <TableHead>{{ t('dataset.list.table.updated') }}</TableHead>
        <TableHead class="text-right">{{ t('dataset.list.table.actions') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="datasets.length === 0" :colspan="columnCount">
        {{ t('dataset.list.empty') }}
      </TableEmpty>
      <TableRow
        v-for="dataset in datasets"
        :key="dataset.id"
        class="cursor-pointer"
        @click="navigateTo(`/dataset/${dataset.id}`)"
      >
        <TableCell class="w-12">
          <DatabaseIcon class="size-4 stroke-1.5" />
        </TableCell>
        <TableCell>
          <div class="text-sm font-semibold">{{ dataset.name }}</div>
          <div v-if="dataset.description" class="max-w-80 truncate text-xs text-muted-foreground">
            {{ dataset.description }}
          </div>
        </TableCell>
        <TableCell>
          <Badge :variant="dataset.origin === 'agent' ? 'secondary' : 'outline'">
            {{ t(`dataset.origin.${dataset.origin}`) }}
          </Badge>
        </TableCell>
        <TableCell class="whitespace-nowrap">{{ dataset.rowCount }}</TableCell>
        <TableCell v-if="showWorkspaceColumn" class="whitespace-nowrap text-sm">
          {{ workspaceName(dataset.workspaceId) }}
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDateTime(dataset.updatedAt) }}
        </TableCell>
        <TableCell class="text-right whitespace-nowrap" @click.stop>
          <Button
            variant="outline"
            size="icon"
            @click="() => emit('delete-dataset', dataset.id)"
          >
            <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
    <TableMetaCaption :itemsLength="datasets.length" :meta="meta" />
  </Table>
</template>
