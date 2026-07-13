<script setup lang="ts">
import type { WorkflowNode } from '@repo/workflow';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';

// Imports

const NO_AGENT = '__none__';

// Props
// The panel only renders this form when node.type === 'agent', so the
// narrowed node (and therefore its config) is guaranteed to be AgentConfig.
const props = defineProps<{
  node: Extract<WorkflowNode, { type: 'agent' }>;
}>();

// Composables
const { data: agentsData, isLoading: isLoadingAgents } = useGetAllAgents();

// Computed
const agentOptions = computed(() => agentsData.value?.agents ?? []);

const selectedAgentId = computed({
  get: () => props.node.data.config.agentId ?? NO_AGENT,
  set: (value: string) => {
    props.node.data.config.agentId = value === NO_AGENT ? undefined : value;
  },
});
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">Agent</Label>
      <Select v-model="selectedAgentId">
        <SelectTrigger class="w-full">
          <SelectValue placeholder="Select an agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="NO_AGENT">None (use system prompt below)</SelectItem>
          <SelectItem v-for="agent in agentOptions" :key="agent.id" :value="agent.id">
            {{ agent.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="isLoadingAgents" class="mt-1 text-xs text-muted-foreground">
        Loading agents...
      </p>
    </div>

    <div v-if="!node.data.config.agentId">
      <Label class="mb-2 block text-sm font-medium">System prompt</Label>
      <Textarea
        v-model="node.data.config.systemPrompt"
        rows="4"
        placeholder="You are a helpful assistant."
      />
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">Prompt</Label>
      <Textarea v-model="node.data.config.prompt" rows="6" />
      <WorkflowTemplateHint class="mt-1" />
    </div>
  </div>
</template>
