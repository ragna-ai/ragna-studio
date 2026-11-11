<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { DialogClose } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
const { t } = useI18n();
</script>

<template>
  <div
    data-slot="sheet-header"
    :class="
      cn(
        'flex shrink-0 items-center gap-3 border-b py-4 pr-4 pl-6',
        props.class,
      )
    "
  >
    <slot />
    <div class="ml-auto flex items-center gap-1">
      <slot name="actions" />
      <DialogClose as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="text-icon"
          :aria-label="t('common.close')"
        >
          <Icon name="hugeicons:cancel-01" class="size-4" />
        </Button>
      </DialogClose>
    </div>
  </div>
</template>
