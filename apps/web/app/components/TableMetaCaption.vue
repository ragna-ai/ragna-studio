<script setup lang="ts">
// Imports

interface Props {
  itemsLength: number;
  meta?: { totalCount: number };
}

// Props
const props = defineProps<Props>();

// Emits

// Refs

// Composables

// Computed
const totalCount = computed(() => props.meta?.totalCount ?? props.itemsLength);

// Functions

// Hooks
</script>

<template>
  <TableCaption>{{
    $t('pagination.entries', { count: itemsLength, total: totalCount })
  }}</TableCaption>
</template>
