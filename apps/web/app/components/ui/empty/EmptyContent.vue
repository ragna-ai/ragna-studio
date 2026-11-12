<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="empty-content"
    :class="
      cn(
        'flex w-full min-w-0 flex-col items-center gap-2 text-small text-balance',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
