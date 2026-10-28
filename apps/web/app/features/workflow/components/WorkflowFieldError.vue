<script setup lang="ts">
import { findFieldIssue } from '~/features/workflow/lib/validate-draft';
import type { WorkflowFieldIssue } from '~/features/workflow/types/validation';

// Props
const props = defineProps<{
  issues: readonly WorkflowFieldIssue[];
  field: string;
}>();

// Composables
const { t } = useI18n();

// Computed
const issue = computed(() => findFieldIssue(props.issues, props.field));
</script>

<template>
  <p v-if="issue" class="mt-1 text-xs text-destructive">
    {{ t(issue.messageKey) }}
  </p>
</template>
