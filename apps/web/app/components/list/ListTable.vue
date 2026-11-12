<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Table } from '~/components/ui/table';
import { cn } from '~/lib/utils';

interface ListTableProps {
  class?: HTMLAttributes['class'];
}

const props = defineProps<ListTableProps>();
</script>

<template>
  <Table
    :class="
      cn(
        '[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0',
        props.class,
      )
    "
  >
    <slot />
  </Table>
</template>
