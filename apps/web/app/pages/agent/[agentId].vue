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

// Computed
// Functions

// Hooks
</script>

<template>
  <div class="p-5">
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('assistant.upsert.title')"
          :subtitle="$t('assistant.upsert.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
  </div>
</template>
