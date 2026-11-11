<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div data-slot="card-action" :class="cn('ml-auto shrink-0', props.class)">
    <slot />
  </div>
</template>
