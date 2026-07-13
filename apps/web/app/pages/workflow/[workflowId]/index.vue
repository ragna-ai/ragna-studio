<script setup lang="ts">
import { Shimmer } from '~/components/ai-elements/shimmer';
import WorkflowEditor from '~/features/workflow/components/WorkflowEditor.vue';
import { useGetWorkflow } from '~/features/workflow/composables/useWorkflowApi';

// Imports

definePageMeta({
  title: 'Workflow Editor',
  validate: (route) => hasValidWorkflowId(route.params),
});

const route = useRoute();
const workflowId = computed(() => route.params.workflowId as string);

// Composables
const { data, error: workflowError } = useGetWorkflow(workflowId);
const { t } = useI18n();

useHead({
  title: t('workflow.editor.title'),
});
</script>

<template>
  <WorkflowEditor
    v-if="data?.workflow"
    :key="data.workflow.id"
    :workflow="data.workflow"
  />
  <div
    v-else-if="workflowError"
    class="flex h-full w-full items-center justify-center"
  >
    <p class="text-sm text-stone-500">
      {{
        workflowError.message ||
        'An error occurred while fetching the workflow.'
      }}
    </p>
  </div>
  <div v-else class="flex h-full w-full items-center justify-center">
    <Shimmer class="h-6 w-48"> Loading workflow... </Shimmer>
  </div>
</template>
