<script setup lang="ts">
import AgentManyTable from '~/features/agent/components/AgentManyTable.vue';
import { useDeleteAgent } from '~/features/agent/composables/useAgentApi';
import useAgentList from '~/features/agent/composables/useAgentList';

// Props
// Emits

// Composables
const { page, limit, useGetAllAgents } = useAgentList();
const { data, error, isPending, refetch } = useGetAllAgents();
const { mutateAsync: deleteAgent } = useDeleteAgent();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('agent.list.title'),
});

// Refs
const searchText = ref('');

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });
const hasNoAgentsAtAll = computed(() => data.value?.meta.totalCount === 0);

// Functions
const handleDeleteAgent = async (agentId: string) => {
  const agentName =
    data.value?.agents.find((agent) => agent.id === agentId)?.name ?? '';
  const confirmed = await confirm({
    title: t('agent.list.deleteConfirm.title'),
    message: t('agent.list.deleteConfirm.message', { name: agentName }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteAgent(agentId);
};
</script>

<template>
  <PagePanel>
    <SectionWrapper>
      <Heading bg-position="bottom">
        <template #top>
          <HeadingTitle
            :title="t('agent.list.title')"
            :subtitle="t('agent.list.subtitle')"
          >
            <template #button>
              <Button as-child leading-icon="hugeicons:plus-sign">
                <NuxtLinkLocale to="/agent/create">
                  {{ t('agent.list.newAgent') }}
                </NuxtLinkLocale>
              </Button>
            </template>
          </HeadingTitle>
        </template>
        <template #bottom> </template>
      </Heading>
      <div class="px-5">
        <ListErrorAlert
          v-if="error && !data"
          :title="t('agent.list.loadError.title')"
          :description="t('agent.list.loadError.description')"
          @retry="refetch()"
        />
        <Empty v-else-if="hasNoAgentsAtAll">
          <EmptyMedia variant="icon">
            <Icon name="hugeicons:robotic" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{{ t('agent.list.empty.title') }}</EmptyTitle>
            <EmptyDescription>
              {{ t('agent.list.empty.description') }}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button as-child leading-icon="hugeicons:plus-sign">
              <NuxtLinkLocale to="/agent/create">
                {{ t('agent.list.newAgent') }}
              </NuxtLinkLocale>
            </Button>
          </EmptyContent>
        </Empty>
        <template v-else>
          <div class="flex h-11 items-center border-b">
            <ListSearch
              v-model="searchText"
              :placeholder="t('agent.list.search')"
            />
          </div>
          <AgentManyTable
            :agents="data?.agents ?? []"
            :is-loading="isPending"
            @delete-agent="handleDeleteAgent"
          />
          <ListPagination
            v-if="!isPending && meta.totalCount > 0"
            v-model:page="page"
            v-model:limit="limit"
            :total-count="meta.totalCount"
            noun="agent.list.count"
          />
        </template>
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
