<script setup lang="ts">
import AgentManyTable from '~/features/agent/components/AgentManyTable.vue';
import { useDeleteAgent } from '~/features/agent/composables/useAgentApi';
import useAgentList from '~/features/agent/composables/useAgentList';

// Props
// Emits

// Refs

// Composables
const { page, limit, useGetAllAgents } = useAgentList();
const { data, error: agentsError } = useGetAllAgents();
const { mutateAsync: deleteAgent } = useDeleteAgent();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('agent.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

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

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('agent.list.title')"
          :subtitle="$t('agent.list.subtitle')"
        >
          <template #button>
            <Button as-child variant="secondary">
              <NuxtLinkLocale to="/agent/create">
                {{ $t('agent.list.newAgent') }}
              </NuxtLinkLocale>
            </Button>
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div v-if="data?.agents" class="px-5">
      <AgentManyTable :agents="data.agents" @delete-agent="handleDeleteAgent" />
      <div class="pb-10">
        <!-- Pagination Controls -->
        <PaginateControls
          v-if="meta.totalCount > 10"
          v-model:page="page"
          v-model:limit="limit"
          :meta="meta"
        />
      </div>
    </div>
    <div v-else-if="agentsError">
      <p class="text-sm text-stone-500">
        {{
          agentsError.message || 'An error occurred while fetching the agents.'
        }}
      </p>
    </div>
  </SectionWrapper>
</template>
