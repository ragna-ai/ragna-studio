<script setup lang="ts">
import type { ToggleEmits, ToggleProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { ToggleVariants } from '.';
import { computed, useSlots } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from '@/lib/utils';
import { Toggle, useForwardPropsEmits } from 'reka-ui';
import { toggleVariants } from '.';

const props = withDefaults(
  defineProps<
    ToggleProps & {
      class?: HTMLAttributes['class'];
      variant?: ToggleVariants['variant'];
      size?: ToggleVariants['size'];
      leadingIcon?: `hugeicons:${string}`;
    }
  >(),
  {
    variant: 'default',
    size: 'default',
    disabled: false,
  },
);

const emits = defineEmits<ToggleEmits>();

const slots = useSlots();
const hasLeading = computed(() => !!props.leadingIcon || !!slots.leading);

const delegatedProps = reactiveOmit(
  props,
  'class',
  'size',
  'variant',
  'leadingIcon',
);
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <Toggle
    v-slot="slotProps"
    data-slot="toggle"
    v-bind="forwarded"
    :class="
      cn(toggleVariants({ variant, size, leading: hasLeading }), props.class)
    "
  >
    <slot name="leading">
      <Icon v-if="leadingIcon" :name="leadingIcon" class="size-4" />
    </slot>
    <slot v-bind="slotProps" />
  </Toggle>
</template>
