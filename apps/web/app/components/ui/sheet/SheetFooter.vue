<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
</script>

<template>
  <div
    data-slot="sheet-footer"
    :class="
      cn('flex h-16 shrink-0 items-center gap-2 border-t px-6', props.class)
    "
  >
    <slot />
  </div>
</template>
