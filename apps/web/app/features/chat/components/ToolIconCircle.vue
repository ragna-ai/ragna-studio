<script setup lang="ts">
// Imports
import type { Component } from 'vue';
import { cn } from '~/lib/utils';

// Props
interface Props {
  icon: Component;
  colorClass: string;
}

defineProps<Props>();
</script>

<template>
  <span
    :class="
      cn(
        'flex size-5 items-center justify-center rounded-full border border-border bg-background ring-2 ring-background',
        colorClass,
      )
    "
  >
    <component :is="icon" class="size-3 stroke-1.5" />
  </span>
</template>
