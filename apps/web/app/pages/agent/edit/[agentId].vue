<script setup lang="ts">
import AgentUpsertForm from '~/features/agent/components/AgentUpsertForm.vue';
import useAgentApi from '~/features/agent/composables/useAgentApi';

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

const { getAgent } = useAgentApi();
const { data, error: agentError } = getAgent(agentId);

// Computed
// Functions

// Hooks
</script>

<template>
  <div>
    <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
  </div>
</template>
