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

useHead({
  title: t('agent.upsert.title'),
});

// Computed
const crumbs = computed<PageCrumb[]>(() => [
  { label: t('agent.list.title'), to: '/agent' },
  { label: data.value?.agent.name ?? t('agent.upsert.title') },
]);

// Functions

// Hooks
</script>

<template>
  <PagePanel :crumbs="crumbs">
    <SectionWrapper class="h-full">
      <Heading bg-position="bottom">
        <template #top>
          <HeadingTitle
            :title="$t('agent.upsert.title')"
            :subtitle="$t('agent.upsert.subtitle')"
          />
        </template>
        <template #bottom> </template>
      </Heading>
      <div class="flex min-h-0 flex-1 flex-col px-20 pb-8">
        <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
