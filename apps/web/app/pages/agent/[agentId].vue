<script setup lang="ts">
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
  <PagePanel :crumbs="crumbs">
    <SectionWrapper class="h-full">
      <div class="flex min-h-0 flex-1 flex-col px-page py-8">
        <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
