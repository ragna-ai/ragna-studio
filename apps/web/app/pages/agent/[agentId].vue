<script setup lang="ts">
import AgentActionsMenu from '~/features/agent/components/AgentActionsMenu.vue';
import AgentLockMenu from '~/features/agent/components/AgentLockMenu.vue';
import AgentUpsertForm from '~/features/agent/components/AgentUpsertForm.vue';
import { useGetAgent } from '~/features/agent/composables/useAgentApi';

// Imports

definePageMeta({
  validate: (route) => hasValidAgentId(route.params),
});

const route = useRoute();
const agentId = computed(() => route.params.agentId as string);

// Props
// Emits

// Refs

// Composables
const { data, error: agentError } = useGetAgent(agentId);
const { t } = useI18n();

// Computed
const agentName = computed(
  () => data.value?.agent.name || t('agent.upsert.untitled'),
);
const crumbs = computed<PageCrumb[]>(() => [
  { label: t('agent.list.title'), to: '/agent' },
  { label: agentName.value },
]);

// Functions

// Hooks
useHead({ title: agentName });
</script>

<template>
  <PagePanel>
    <template #header>
      <NavTopBar :crumbs="crumbs">
        <template #right>
          <template v-if="data?.agent">
            <AgentLockMenu
              :agent-id="agentId"
              :lock="data.agent.lock"
              :lock-actions="data.agent.lockActions"
              :tool-grants="data.agent.toolGrants ?? []"
            />
            <AgentActionsMenu :agent-id="agentId" />
          </template>
        </template>
      </NavTopBar>
    </template>
    <SectionWrapper class="h-full">
      <div class="flex min-h-0 flex-1 flex-col px-page py-8">
        <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
