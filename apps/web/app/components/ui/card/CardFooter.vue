<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="card-footer"
    :class="
      cn(
        '-mx-card flex h-11 items-center border-t px-card text-small text-muted-foreground',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
