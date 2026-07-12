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
  <TableCaption>{{ itemsLength }} of {{ totalCount }} entries</TableCaption>
</template>
