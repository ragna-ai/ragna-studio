<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';
import type { ChatAgentOption } from '~/features/chat/types';

interface ChatAgentChipProps {
  agent: ChatAgentOption;
}

defineProps<ChatAgentChipProps>();
</script>

<template>
  <div
    class="flex h-7 min-w-0 items-center gap-2 rounded-md bg-surface-subtle pr-2.5 pl-1"
  >
    <AgentMark
      :agent-id="agent.id"
      :icon="agent.icon"
      :tone="agent.tone"
      :image-url="agent.imageUrl"
      :size="20"
    />
    <span class="truncate text-body font-medium">{{ agent.name }}</span>
  </div>
</template>
