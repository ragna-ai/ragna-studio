<script setup lang="ts">
interface PickerRowProps {
  title: string;
  hint?: string;
  selected?: boolean;
}

defineProps<PickerRowProps>();
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-2.5 py-1">
    <slot name="lead" />
    <span class="flex min-w-0 flex-col">
      <span class="truncate text-small font-medium">{{ title }}</span>
      <span v-if="hint" class="truncate text-caption text-muted-foreground">
        {{ hint }}
      </span>
    </span>
    <Icon
      v-if="selected"
      name="hugeicons:tick-02"
      class="ml-auto size-4 shrink-0 text-foreground"
    />
  </div>
</template>
