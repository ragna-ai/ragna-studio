<script setup lang="ts">
import AgentManyTable from '~/features/agent/components/AgentManyTable.vue';
import { useDeleteAgent } from '~/features/agent/composables/useAgentApi';
import useAgentList from '~/features/agent/composables/useAgentList';

// Imports

// Props
// Emits

// Refs

// Composables
const { page, limit, useGetAllAgents } = useAgentList();
const { data, error: agentsError } = useGetAllAgents();
const { mutateAsync: deleteAgent } = useDeleteAgent();

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

// Functions
const handleDeleteAgent = async (agentId: string) => {
  await deleteAgent(agentId);
};

// Hooks
</script>

<template>
  <div class="p-10">
    <div>Agent index List</div>
    <div v-if="data?.agents">
      <AgentManyTable
        :agents="data.agents"
        :favorites="data?.agentFavorites"
        @delete-agent="handleDeleteAgent"
      />
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
    <div v-else>
      <p class="text-sm text-stone-500">Loading agents...</p>
    </div>
  </div>
</template>
