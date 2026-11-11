<script lang="ts" setup>
import type { CalendarCellTriggerProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { CalendarCellTrigger, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<CalendarCellTriggerProps & { class?: HTMLAttributes['class'] }>(),
  {
    as: 'button',
  },
);

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarCellTrigger
    data-slot="calendar-cell-trigger"
    :class="
      cn(
        'relative inline-flex h-8 w-9 cursor-default items-center justify-center rounded-md text-small outline-hidden hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'data-today:font-medium data-today:after:absolute data-today:after:bottom-0.5 data-today:after:left-1/2 data-today:after:size-1 data-today:after:-translate-x-1/2 data-today:after:rounded-full data-today:after:bg-foreground',
        'data-selected:bg-primary data-selected:font-medium data-selected:text-primary-foreground data-selected:opacity-100 data-selected:after:bg-primary-foreground data-selected:hover:bg-primary',
        'data-disabled:pointer-events-none data-disabled:opacity-40',
        'data-unavailable:pointer-events-none data-unavailable:text-muted-foreground data-unavailable:line-through',
        'data-outside-view:text-muted-foreground data-outside-view:opacity-60',
        props.class,
      )
    "
    v-bind="forwardedProps"
  >
    <slot />
  </CalendarCellTrigger>
</template>
