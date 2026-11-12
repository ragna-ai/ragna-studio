<script setup lang="ts">
interface ListTitleCellProps {
  title: string;
  description?: string;
}

defineProps<ListTitleCellProps>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-3">
    <slot name="lead" />
    <div class="flex min-w-0 flex-col">
      <span class="truncate text-body">{{ title }}</span>
      <span
        v-if="description"
        class="truncate text-small text-muted-foreground"
      >
        {{ description }}
      </span>
    </div>
  </div>
</template>
