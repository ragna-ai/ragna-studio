<script setup lang="ts">
import WorkflowManyTable from '~/features/workflow/components/WorkflowManyTable.vue';
import { useDeleteWorkflow } from '~/features/workflow/composables/useWorkflowApi';
import useWorkflowList from '~/features/workflow/composables/useWorkflowList';

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
    title: t('workflow.list.deleteConfirm.title'),
    message: t('workflow.list.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
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
          :title="t('workflow.list.title')"
          :subtitle="t('workflow.list.subtitle')"
        >
          <template #button>
            <Button as-child variant="secondary">
              <NuxtLinkLocale to="/workflow/create">
                {{ t('workflow.list.newWorkflow') }}
              </NuxtLinkLocale>
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
          t('workflow.list.loadError')
        }}
      </p>
    </div>
  </SectionWrapper>
</template>
