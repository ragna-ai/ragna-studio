<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="alert-description"
    :class="
      cn(
        'col-start-2 text-body text-muted-foreground [&_p]:leading-relaxed',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
