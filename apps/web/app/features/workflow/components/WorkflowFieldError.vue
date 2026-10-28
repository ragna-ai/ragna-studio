<script setup lang="ts">
import type { WorkflowFieldIssue } from '~/features/workflow/types/validation';

// Props
defineProps<{
  issue?: WorkflowFieldIssue;
}>();

// Composables
const { t } = useI18n();
</script>

<template>
  <p v-if="issue" class="mt-1 text-xs text-destructive">
    {{ t(issue.messageKey) }}
  </p>
</template>
