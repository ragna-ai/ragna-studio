<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { ButtonVariants } from '.';
import { computed, useSlots } from 'vue';
import { Primitive } from 'reka-ui';
import { cn } from '@/lib/utils';
import { buttonIconClasses, buttonVariants } from '.';

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  class?: HTMLAttributes['class'];
  leadingIcon?: `hugeicons:${string}`;
  trailingIcon?: `hugeicons:${string}`;
  loading?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
  size: 'default',
});

const slots = useSlots();
const hasLeading = computed(
  () => props.loading || !!props.leadingIcon || !!slots.leading,
);
const isDisabled = computed(
  () => props.as === 'button' && (props.disabled || props.loading),
);
const iconClass = computed(() => buttonIconClasses[props.size ?? 'default']);
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :data-size="size"
    :as="as"
    :as-child="asChild"
    :disabled="isDisabled || undefined"
    :aria-busy="loading || undefined"
    :class="
      cn(buttonVariants({ variant, size, leading: hasLeading }), props.class)
    "
  >
    <Icon
      v-if="loading"
      name="hugeicons:loading-03"
      :class="[iconClass, 'animate-spin motion-reduce:animate-none']"
    />
    <slot v-else name="leading">
      <Icon v-if="leadingIcon" :name="leadingIcon" :class="iconClass" />
    </slot>
    <slot />
    <Icon v-if="trailingIcon" :name="trailingIcon" :class="iconClass" />
  </Primitive>
</template>
