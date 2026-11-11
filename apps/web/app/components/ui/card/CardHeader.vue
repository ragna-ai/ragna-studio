<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="card-header"
    :class="
      cn(
        '@container/card-header flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 [&>[data-slot=card-action]]:ml-auto [&>[data-slot=card-description]]:order-last [&>[data-slot=card-description]]:basis-full',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
