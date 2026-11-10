<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
</script>

<template>
  <div
    data-slot="sheet-header"
    :class="
      cn(
        'flex h-topbar shrink-0 items-center gap-3 border-b pr-15 pl-6',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
