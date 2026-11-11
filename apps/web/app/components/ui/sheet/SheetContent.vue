<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from '@/lib/utils';
import { DialogContent, DialogPortal, useForwardPropsEmits } from 'reka-ui';
import SheetOverlay from './SheetOverlay.vue';

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class'];
  side?: 'top' | 'right' | 'bottom' | 'left';
  size?: 'default' | 'lg';
}

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<SheetContentProps>(), {
  side: 'right',
  size: 'default',
});
const emits = defineEmits<DialogContentEmits>();

const delegatedProps = reactiveOmit(props, 'class', 'side', 'size');

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <SheetOverlay />
    <DialogContent
      data-slot="sheet-content"
      :class="
        cn(
          'fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
          side === 'right' &&
            'inset-y-shell right-shell max-w-3/4 overflow-hidden rounded-lg border shadow-popover data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          side === 'right' && size === 'default' && 'w-sheet',
          side === 'right' && size === 'lg' && 'w-sheet-lg',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
          side === 'top' &&
            'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          props.class,
        )
      "
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
