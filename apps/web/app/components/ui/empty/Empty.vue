<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { EmptyVariants } from '.';
import { cn } from '@/lib/utils';
import { emptyVariants } from '.';

const props = defineProps<{
  class?: HTMLAttributes['class'];
  size?: EmptyVariants['size'];
}>();
</script>

<template>
  <div
    data-slot="empty"
    :data-size="size"
    :class="cn(emptyVariants({ size }), props.class)"
  >
    <slot />
  </div>
</template>
