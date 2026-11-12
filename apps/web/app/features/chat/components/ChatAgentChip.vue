<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';

interface ChatAgentChipProps {
  agentId: string;
  name: string;
}

defineProps<ChatAgentChipProps>();
</script>

<template>
  <div
    class="flex h-7 min-w-0 items-center gap-2 rounded-md bg-surface-subtle pr-2.5 pl-1"
  >
    <AgentMark :agent-id="agentId" :size="20" />
    <span class="truncate text-body font-medium">{{ name }}</span>
  </div>
</template>
