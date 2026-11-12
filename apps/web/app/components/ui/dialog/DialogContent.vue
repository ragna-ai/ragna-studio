<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import DialogOverlay from './DialogOverlay.vue';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<
    DialogContentProps & {
      class?: HTMLAttributes['class'];
      showCloseButton?: boolean;
    }
  >(),
  {
    showCloseButton: true,
  },
);
const emits = defineEmits<DialogContentEmits>();
const { t } = useI18n();

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-popover duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
          props.class,
        )
      "
    >
      <slot />

      <DialogClose v-if="showCloseButton" as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="absolute top-5 right-4 text-icon"
          :aria-label="t('common.close')"
        >
          <Icon name="hugeicons:cancel-01" />
        </Button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
