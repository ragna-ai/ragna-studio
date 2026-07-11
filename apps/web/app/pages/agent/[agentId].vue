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
  <div class="p-10">
    {{ data?.agent }}
    <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
  </div>
</template>
