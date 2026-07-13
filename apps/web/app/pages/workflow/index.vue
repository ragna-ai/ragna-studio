<script setup lang="ts">
import WorkflowManyTable from '~/features/workflow/components/WorkflowManyTable.vue';
import { useDeleteWorkflow } from '~/features/workflow/composables/useWorkflowApi';
import useWorkflowList from '~/features/workflow/composables/useWorkflowList';

// Imports

// Props
// Emits

// Refs

// Composables
const { page, limit, useGetAllWorkflows } = useWorkflowList();
const { data, error: workflowsError } = useGetAllWorkflows();
const { mutateAsync: deleteWorkflow } = useDeleteWorkflow();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('workflow.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

// Functions
const handleDeleteWorkflow = async (workflowId: string) => {
  const confirmed = await confirm({
    title: 'Delete Workflow',
    message: 'Are you sure you want to delete this workflow?',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteWorkflow(workflowId);
};

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          title="Workflows"
          subtitle="Automate multi-step tasks with agents, tools, and conditions."
        >
          <template #button>
            <Button as-child variant="secondary">
              <NuxtLinkLocale to="/workflow/create"
                >New workflow</NuxtLinkLocale
              >
            </Button>
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div v-if="data?.workflows" class="px-5">
      <WorkflowManyTable
        :workflows="data.workflows"
        :meta="meta"
        @delete-workflow="handleDeleteWorkflow"
      />
      <div class="pb-10">
        <PaginateControls
          v-if="meta.totalCount > 10"
          v-model:page="page"
          v-model:limit="limit"
          :meta="meta"
        />
      </div>
    </div>
    <div v-else-if="workflowsError">
      <p class="text-sm text-stone-500">
        {{
          workflowsError.message ||
          'An error occurred while fetching the workflows.'
        }}
      </p>
    </div>
    <div v-else>
      <p class="text-sm text-stone-500">Loading workflows...</p>
    </div>
  </SectionWrapper>
</template>
