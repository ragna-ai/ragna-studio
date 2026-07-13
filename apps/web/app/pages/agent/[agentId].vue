<script setup lang="ts">
import AgentUpsertForm from '~/features/agent/components/AgentUpsertForm.vue';
import { useGetAgent } from '~/features/agent/composables/useAgentApi';

// Imports

definePageMeta({
  title: 'Chat Conversation',
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
// Functions

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('agent.upsert.title')"
          :subtitle="$t('agent.upsert.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-10">
      <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
    </div>
  </SectionWrapper>
</template>
