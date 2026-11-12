<script setup lang="ts">
import type { DatasetListItem } from '~/features/dataset/types';

// Imports

interface Props {
  datasets: DatasetListItem[];
  isLoading: boolean;
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'delete-dataset', datasetId: string): void;
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Functions
function datasetPath(dataset: DatasetListItem): string {
  return `/dataset/${dataset.id}`;
}
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('common.name') }}</TableHead>
        <TableHead class="w-25">{{ t('dataset.list.table.origin') }}</TableHead>
        <TableHead class="w-20 text-right">
          {{ t('dataset.list.table.columns') }}
        </TableHead>
        <TableHead class="w-20 text-right">
          {{ t('dataset.list.table.rows') }}
        </TableHead>
        <TableHead class="w-45">{{ t('common.updated') }}</TableHead>
        <TableHead class="w-10">
          <span class="sr-only">{{ t('common.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListSkeletonRows
        v-if="isLoading"
        :columns="['title', 'bar', 'bar', 'bar', 'bar', 'none']"
        tall
      />
      <template v-else>
        <TableRow
          v-for="dataset in datasets"
          :key="dataset.id"
          class="h-14 cursor-pointer"
          @click="navigateTo(datasetPath(dataset))"
        >
          <TableCell>
            <ListTitleCell
              :title="dataset.name"
              :description="dataset.description ?? undefined"
              :to="datasetPath(dataset)"
            >
              <template #lead>
                <Icon name="hugeicons:grid-table" class="size-4 text-icon" />
              </template>
            </ListTitleCell>
          </TableCell>
          <TableCell>
            <Badge
              :variant="dataset.origin === 'user' ? 'outline' : 'secondary'"
            >
              {{ t(`dataset.origin.${dataset.origin}`) }}
            </Badge>
          </TableCell>
          <TableCell class="text-right text-mono">
            {{ dataset.columns.length }}
          </TableCell>
          <TableCell class="text-right text-mono">
            {{ dataset.rowCount }}
          </TableCell>
          <TableCell class="text-small text-muted-foreground">
            {{ formatDateTime(dataset.updatedAt) }}
          </TableCell>
          <TableCell>
            <ListRowActions>
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="datasetPath(dataset)">
                  <Icon name="hugeicons:pencil-edit-02" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-dataset', dataset.id)"
              >
                <Icon name="hugeicons:delete-02" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </ListRowActions>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </ListTable>
</template>
