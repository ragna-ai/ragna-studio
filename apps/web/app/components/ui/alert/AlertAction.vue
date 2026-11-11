<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="alert-action"
    :class="
      cn('col-start-3 row-span-2 row-start-1 ml-3 self-center', props.class)
    "
  >
    <slot />
  </div>
</template>
