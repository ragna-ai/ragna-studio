<script setup lang="ts">
import type { PaginationPrevProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { ButtonVariants } from '@/components/ui/button';
import { reactiveOmit } from '@vueuse/core';
import { cn } from '@/lib/utils';
import { PaginationPrev, useForwardProps } from 'reka-ui';
import { buttonVariants } from '@/components/ui/button';

const props = withDefaults(
  defineProps<
    PaginationPrevProps & {
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
  <PaginationPrev
    data-slot="pagination-previous"
    :class="cn(buttonVariants({ variant: 'ghost', size }), props.class)"
    v-bind="forwarded"
  >
    <slot>
      <Icon name="hugeicons:arrow-left-01" />
    </slot>
  </PaginationPrev>
</template>
