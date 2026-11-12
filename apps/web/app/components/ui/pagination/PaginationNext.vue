<script setup lang="ts">
import type { PaginationNextProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { ButtonVariants } from '@/components/ui/button';
import { reactiveOmit } from '@vueuse/core';
import { cn } from '@/lib/utils';
import { PaginationNext, useForwardProps } from 'reka-ui';
import { buttonVariants } from '@/components/ui/button';

const props = withDefaults(
  defineProps<
    PaginationNextProps & {
      size?: ButtonVariants['size'];
      class?: HTMLAttributes['class'];
    }
  >(),
  {
    size: 'icon-sm',
  },
);

const delegatedProps = reactiveOmit(props, 'class', 'size');
const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <PaginationNext
    data-slot="pagination-next"
    :class="cn(buttonVariants({ variant: 'ghost', size }), props.class)"
    v-bind="forwarded"
  >
    <slot>
      <Icon name="hugeicons:arrow-right-01" />
    </slot>
  </PaginationNext>
</template>
