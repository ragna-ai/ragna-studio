<script setup lang="ts">
import type { PaginationEllipsisProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from '@/lib/utils';
import { PaginationEllipsis } from 'reka-ui';

const props = defineProps<
  PaginationEllipsisProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <PaginationEllipsis
    data-slot="pagination-ellipsis"
    v-bind="delegatedProps"
    :class="
      cn(
        'flex size-7 items-center justify-center text-caption text-muted-foreground',
        props.class,
      )
    "
  >
    <slot> &hellip; </slot>
  </PaginationEllipsis>
</template>
