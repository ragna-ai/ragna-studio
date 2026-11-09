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
      class="size-1 animate-loader-dot rounded-full bg-muted-foreground/70 motion-reduce:animate-none"
    />
    <span
      class="size-1 animate-loader-dot rounded-full bg-muted-foreground/70 [animation-delay:150ms] motion-reduce:animate-none"
    />
    <span
      class="size-1 animate-loader-dot rounded-full bg-muted-foreground/70 [animation-delay:300ms] motion-reduce:animate-none"
    />
  </span>
</template>
