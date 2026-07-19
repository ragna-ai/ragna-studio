<script setup lang="ts">
import { storeToRefs } from 'pinia';
import WorkflowRunView from '~/features/workflow/components/WorkflowRunView.vue';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

definePageMeta({
  validate: (route) => hasValidWorkflowRunId(route.params),
});

const route = useRoute();
const workflowId = computed(() => route.params.workflowId as string);
const runId = computed(() => route.params.runId as string);

const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { t } = useI18n();

useHead({
  title: t('workflow.run.title'),
});
</script>

<template>
  <WorkflowRunView
    :key="runId"
    :workspace-id="activeWorkspaceId"
    :workflow-id="workflowId"
    :run-id="runId"
  />
</template>
