<script lang="ts" setup>
import { cn } from '@/lib/utils';
import type { ToasterProps } from 'vue-sonner';
import { Toaster as Sonner } from 'vue-sonner';
import Spinner from '~/components/ui/spinner/Spinner.vue';

const props = defineProps<ToasterProps>();

const { t } = useI18n();

// `!` because vue-sonner's stylesheet sets padding, shadow and description colour with higher specificity
const TOAST_OPTIONS: ToasterProps['toastOptions'] = {
  classes: {
    toast: 'gap-2 px-4! py-3! shadow-popover!',
    title: 'text-body font-medium text-foreground',
    description: 'text-small text-muted-foreground!',
    closeButton:
      'static! order-last ml-auto size-6! self-start rounded-sm! border-0! bg-transparent! text-icon! transform-none! hover:bg-surface-subtle!',
  },
};
</script>

<template>
  <Sonner
    v-bind="props"
    :class="cn('toaster group', props.class)"
    :style="{
      '--normal-bg': 'var(--background)',
      '--normal-text': 'var(--foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius-lg)',
      '--width': '22.5rem',
    }"
    :toast-options="TOAST_OPTIONS"
    :close-button-aria-label="t('common.close')"
  >
    <template #success-icon>
      <Icon
        name="hugeicons:checkmark-circle-02"
        class="size-4 text-status-ok-fg"
      />
    </template>
    <template #info-icon>
      <Icon name="hugeicons:information-circle" class="size-4 text-icon" />
    </template>
    <template #warning-icon>
      <Icon name="hugeicons:alert-02" class="size-4 text-status-warn-fg" />
    </template>
    <template #error-icon>
      <Icon
        name="hugeicons:alert-circle"
        class="size-4 text-status-danger-fg"
      />
    </template>
    <template #loading-icon>
      <Spinner />
    </template>
    <template #close-icon>
      <Icon name="hugeicons:cancel-01" class="size-3.5" />
    </template>
  </Sonner>
</template>
