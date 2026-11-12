<script setup lang="ts">
import { Empty, EmptyTitle } from '~/components/ui/empty';
import { TableCell, TableRow } from '~/components/ui/table';

interface ListEmptyRowProps {
  colspan: number;
}

defineProps<ListEmptyRowProps>();
</script>

<template>
  <TableRow class="hover:bg-transparent">
    <TableCell :colspan="colspan">
      <Empty size="sm">
        <EmptyTitle><slot /></EmptyTitle>
        <slot name="action" />
      </Empty>
    </TableCell>
  </TableRow>
</template>
