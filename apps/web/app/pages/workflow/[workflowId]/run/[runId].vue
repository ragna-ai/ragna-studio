<script setup lang="ts">
import WorkflowRunView from '~/features/workflow/components/WorkflowRunView.vue';

// Imports

definePageMeta({
  title: 'Workflow Run',
  validate: (route) => hasValidWorkflowRunId(route.params),
});

const route = useRoute();
const runId = computed(() => route.params.runId as string);
</script>

<template>
  <WorkflowRunView :key="runId" :run-id="runId" />
</template>
