<script setup lang="ts">
import { NuxtLinkLocale } from '#components';
import WorkflowManyTable from '~/features/workflow/components/WorkflowManyTable.vue';
import { useDeleteWorkflow } from '~/features/workflow/composables/useWorkflowApi';
import useWorkflowList from '~/features/workflow/composables/useWorkflowList';

// Composables
const { page, limit, useGetAllWorkflows } = useWorkflowList();
const { data, error, isPending, refetch } = useGetAllWorkflows();
const { mutateAsync: deleteWorkflow } = useDeleteWorkflow();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('workflow.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });
const hasNoWorkflowsAtAll = computed(() => data.value?.meta.totalCount === 0);

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
</script>

<template>
  <PagePanel>
    <SectionWrapper>
      <Heading>
        <template #top>
          <HeadingTitle
            :title="t('workflow.list.title')"
            :subtitle="t('workflow.list.subtitle')"
          >
            <template #button>
              <Button
                :as="NuxtLinkLocale"
                to="/workflow/create"
                leading-icon="hugeicons:plus-sign"
              >
                {{ t('workflow.list.newWorkflow') }}
              </Button>
            </template>
          </HeadingTitle>
        </template>
      </Heading>
      <div class="px-page pt-6 pb-10">
        <ListErrorAlert
          v-if="error && !data"
          :title="t('workflow.list.loadError.title')"
          :description="t('workflow.list.loadError.description')"
          @retry="refetch()"
        />
        <Empty v-else-if="hasNoWorkflowsAtAll">
          <EmptyMedia variant="icon">
            <Icon name="hugeicons:workflow-square-10" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{{ t('workflow.list.empty') }}</EmptyTitle>
            <EmptyDescription>
              {{ t('workflow.list.emptyDescription') }}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              :as="NuxtLinkLocale"
              to="/workflow/create"
              leading-icon="hugeicons:plus-sign"
            >
              {{ t('workflow.list.newWorkflow') }}
            </Button>
          </EmptyContent>
        </Empty>
        <template v-else>
          <WorkflowManyTable
            :workflows="data?.workflows ?? []"
            :is-loading="isPending"
            @delete-workflow="handleDeleteWorkflow"
          />
          <ListPagination
            v-if="!isPending && meta.totalCount > 0"
            v-model:page="page"
            v-model:limit="limit"
            :total-count="meta.totalCount"
            noun="workflow.list.count"
          />
        </template>
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
