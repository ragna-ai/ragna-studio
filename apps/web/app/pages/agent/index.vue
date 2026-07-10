<script setup lang="ts">
import useAgentApi from '~/features/agent/composables/useAgentApi';

// Imports

// Props
// Emits

// Refs

// Composables
const { getAllAgents } = useAgentApi();
const { data, error: agentsError } = getAllAgents();

// Computed
// Functions

// Hooks
</script>

<template>
  <div>Agent index List</div>
  <div v-if="data?.agents">
    <ul>
      <li v-for="agent in data.agents" :key="agent.id">
        {{ agent.name }}
      </li>
    </ul>
  </div>
  <div v-else-if="agentsError">
    <p class="text-sm text-stone-500">
      {{
        agentsError.message || 'An error occurred while fetching the agents.'
      }}
    </p>
  </div>
  <div v-else>
    <p class="text-sm text-stone-500">Loading agents...</p>
  </div>
</template>
