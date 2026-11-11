<script lang="ts" setup>
import type { CalendarNextProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { CalendarNext, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const props = defineProps<
  CalendarNextProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarNext
    data-slot="calendar-next-button"
    :class="
      cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), props.class)
    "
    v-bind="forwardedProps"
  >
    <slot>
      <Icon name="hugeicons:arrow-right-01" class="text-icon" />
    </slot>
  </CalendarNext>
</template>
