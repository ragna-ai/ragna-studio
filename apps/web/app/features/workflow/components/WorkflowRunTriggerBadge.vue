<script setup lang="ts">
import type { WorkflowRunTrigger } from '@repo/workflow';
import type { BadgeVariants } from '~/components/ui/badge';

// Imports

// Props
const props = defineProps<{
  trigger: WorkflowRunTrigger;
}>();

// Composables
const { t } = useI18n();

// Computed
const variantByTrigger: Record<WorkflowRunTrigger, BadgeVariants['variant']> = {
  manual: 'outline',
  schedule: 'secondary',
};

const variant = computed(() => variantByTrigger[props.trigger]);
const label = computed(() => t(`workflow.run.trigger.${props.trigger}`));
</script>

<template>
  <Badge :variant="variant">{{ label }}</Badge>
</template>
