<script setup lang="ts">
// Imports
import type { BadgeVariants } from '~/components/ui/badge';
import type { AgentContextDocumentStatus } from '~/features/agent/types';
import { cn } from '~/lib/utils';

// Props
const props = defineProps<{
  status: AgentContextDocumentStatus;
}>();

// Computed
// Color accents layered on top of the shared `outline` variant so each
// status reads clearly without adding new badge variants for one caller
// (same pattern as SocialPostStatusBadge / WorkflowRunStatusBadge).
const variantByStatus: Record<AgentContextDocumentStatus, BadgeVariants['variant']> = {
  pending: 'outline',
  ready: 'outline',
  failed: 'destructive',
};

const colorClassByStatus: Partial<Record<AgentContextDocumentStatus, string>> = {
  ready: 'border-green-600 text-green-700',
};

const variant = computed(() => variantByStatus[props.status]);
const colorClass = computed(() => colorClassByStatus[props.status]);
</script>

<template>
  <Badge :variant="variant" :class="cn('capitalize', colorClass)">{{ status }}</Badge>
</template>
