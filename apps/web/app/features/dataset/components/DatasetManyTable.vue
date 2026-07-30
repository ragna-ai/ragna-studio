<script setup lang="ts">
import { DatabaseIcon, MoreVerticalIcon, PencilIcon, Trash2Icon } from '@lucide/vue';
import type { DatasetListItem } from '~/features/dataset/types';

interface Props {
  datasets: DatasetListItem[];
  meta?: { totalCount: number };
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'delete-dataset', datasetId: string): void;
}>();

// Refs

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Computed

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
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="icon" :aria-label="t('common.actions')">
                <MoreVerticalIcon class="size-4 stroke-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="`/dataset/${dataset.id}`">
                  <PencilIcon class="size-4 stroke-1.5" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="() => emit('delete-dataset', dataset.id)"
              >
                <Trash2Icon class="size-4 stroke-1.5" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    </TableBody>
    <TableMetaCaption :itemsLength="datasets.length" :meta="meta" />
  </Table>
</template>
