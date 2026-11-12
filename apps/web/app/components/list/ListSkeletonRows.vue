<script setup lang="ts">
import { Skeleton } from '~/components/ui/skeleton';
import { TableCell, TableRow } from '~/components/ui/table';

export type ListSkeletonColumn = 'bar' | 'title' | 'none';

interface ListSkeletonRowsProps {
  columns: ListSkeletonColumn[];
  rows?: number;
  /** Rows whose title cell has a second line are taller. */
  tall?: boolean;
}

withDefaults(defineProps<ListSkeletonRowsProps>(), { rows: 5 });
</script>

<template>
  <TableRow v-for="row in rows" :key="row" aria-hidden="true">
    <TableCell
      v-for="(column, index) in columns"
      :key="index"
      :class="{ 'h-14': tall }"
    >
      <div v-if="column === 'title'" class="flex items-center gap-3">
        <Skeleton class="size-6 rounded-sm" />
        <div class="flex flex-col gap-1">
          <Skeleton class="h-3 w-35 rounded-sm" />
          <Skeleton class="h-3 w-55 rounded-sm" />
        </div>
      </div>
      <Skeleton v-else-if="column === 'bar'" class="h-3 w-30 rounded-sm" />
    </TableCell>
  </TableRow>
</template>
