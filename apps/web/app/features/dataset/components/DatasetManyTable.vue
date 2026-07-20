<script setup lang="ts">
import { DatabaseIcon, Trash2Icon } from '@lucide/vue';
import type { DatasetListItem } from '~/features/dataset/types';

interface Props {
  datasets: DatasetListItem[];
  meta?: { totalCount: number };
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'delete-dataset', datasetId: string): void;
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

const columnCount = 6;
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>&nbsp;</TableHead>
        <TableHead>{{ t('common.name') }}</TableHead>
        <TableHead>{{ t('dataset.list.table.origin') }}</TableHead>
        <TableHead>{{ t('dataset.list.table.rows') }}</TableHead>
        <TableHead>{{ t('common.updated') }}</TableHead>
        <TableHead class="text-right">{{ t('common.actions') }}</TableHead>
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
