<script setup lang="ts">
import { findFieldIssue } from '~/features/workflow/lib/validate-draft';
import type { WorkflowFieldIssue } from '~/features/workflow/types/validation';

// Props
const props = defineProps<{
  issues: readonly WorkflowFieldIssue[];
  field: string;
}>();

// Composables
const { n, t } = useI18n();

// Computed
const issue = computed(() => findFieldIssue(props.issues, props.field));
const message = computed(() => {
  if (!issue.value) return '';
  const params = Object.fromEntries(
    Object.entries(issue.value.messageParams ?? {}).map(([key, value]) => [
      key,
      n(value),
    ]),
  );
  return t(issue.value.messageKey, params);
});
</script>

<template>
  <p v-if="issue" class="mt-1 text-xs text-destructive">
    {{ message }}
  </p>
</template>
