<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

interface Props {
  class?: HTMLAttributes['class'];
}

defineProps<Props>();
</script>

<template>
  <span :class="cn('inline-flex items-center gap-1', $props.class)">
    <span
      class="h-1 w-1 animate-loader-dot rounded-full bg-muted-foreground/70 delay-0"
    />
    <span
      class="h-1 w-1 animate-loader-dot rounded-full bg-muted-foreground/70 delay-150"
    />
    <span
      class="h-1 w-1 animate-loader-dot rounded-full bg-muted-foreground/70 delay-300"
    />
  </span>
</template>
