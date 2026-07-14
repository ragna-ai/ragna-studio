<script setup lang="ts">
// Imports
import type { BadgeVariants } from '~/components/ui/badge';
import type { SocialPostStatus } from '~/features/social/composables/useSocialPostApi';
import { cn } from '~/lib/utils';

// Props
const props = defineProps<{
  status: SocialPostStatus;
}>();

// Computed
const variantByStatus: Record<SocialPostStatus, BadgeVariants['variant']> = {
  draft: 'outline',
  published: 'outline',
  failed: 'destructive',
};

// Color accents layered on top of the shared `outline` variant so each
// status reads clearly without adding new badge variants for one caller.
const colorClassByStatus: Partial<Record<SocialPostStatus, string>> = {
  published: 'border-green-600 text-green-700',
};

const variant = computed(() => variantByStatus[props.status]);
const colorClass = computed(() => colorClassByStatus[props.status]);
</script>

<template>
  <Badge :variant="variant" :class="cn('capitalize', colorClass)">
    {{ $t(`social.status.${status}`) }}
  </Badge>
</template>
