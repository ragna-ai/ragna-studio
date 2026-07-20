<script setup lang="ts">
import type { WorkflowRunStatus, WorkflowStepStatus } from '@repo/workflow';
import type { BadgeVariants } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

// Imports

type Status = WorkflowRunStatus | WorkflowStepStatus;

// Props
const props = defineProps<{
  status: Status;
}>();

// Computed
const variantByStatus: Record<Status, BadgeVariants['variant']> = {
  pending: 'outline',
  running: 'outline',
  suspended: 'outline',
  completed: 'outline',
  failed: 'destructive',
  cancelled: 'secondary',
  skipped: 'outline',
};

// Color accents layered on top of the shared `outline` variant so each
// status reads clearly without adding new badge variants for one caller.
const colorClassByStatus: Partial<Record<Status, string>> = {
  running: 'border-blue-500 text-blue-600',
  completed: 'border-green-600 text-green-700',
  skipped: 'border-dashed text-muted-foreground',
};

const { t } = useI18n();

const variant = computed(() => variantByStatus[props.status]);
const colorClass = computed(() => colorClassByStatus[props.status]);
const label = computed(() => t(`workflow.status.${props.status}`));
</script>

<template>
  <Badge :variant="variant" :class="cn(colorClass)">{{ label }}</Badge>
</template>
