<script setup lang="ts">
import { Button } from '~/components/ui/button';

type BannerVariant = 'default' | 'warning' | 'destructive';

interface BannerProps {
  variant?: BannerVariant;
  dismissible?: boolean;
}

const { variant = 'default', dismissible = false } = defineProps<BannerProps>();

defineEmits<{ dismiss: [] }>();

const VARIANT_CLASS: Record<BannerVariant, string> = {
  default: 'bg-surface-subtle',
  warning: 'bg-status-warn-bg',
  destructive: 'bg-status-danger-bg',
};

const ICON: Record<BannerVariant, { name: string; class: string }> = {
  default: { name: 'hugeicons:information-circle', class: 'text-icon' },
  warning: { name: 'hugeicons:alert-02', class: 'text-status-warn-fg' },
  destructive: {
    name: 'hugeicons:alert-circle',
    class: 'text-status-danger-fg',
  },
};
</script>

<template>
  <div
    class="flex h-11 items-center gap-2 border-b px-4"
    :class="VARIANT_CLASS[variant]"
    role="status"
  >
    <Icon
      :name="ICON[variant].name"
      class="size-4 shrink-0"
      :class="ICON[variant].class"
    />
    <p class="min-w-0 flex-1 truncate text-body text-foreground">
      <slot />
    </p>
    <slot name="action" />
    <Button
      v-if="dismissible"
      variant="ghost"
      size="icon-sm"
      :aria-label="$t('common.dismiss')"
      @click="$emit('dismiss')"
    >
      <Icon name="hugeicons:cancel-01" />
    </Button>
  </div>
</template>
