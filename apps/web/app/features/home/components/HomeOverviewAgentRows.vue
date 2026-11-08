<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';
import { useCreateChatAndNavigate } from '~/features/chat/composables/useChatApi';
import HomeOverviewRow from '~/features/home/components/HomeOverviewRow.vue';
import type { HomeOverviewAgentItem } from '~/features/home/types';

interface HomeOverviewAgentRowsProps {
  agents: HomeOverviewAgentItem[];
}

defineProps<HomeOverviewAgentRowsProps>();

const { createChatAndNavigate } = useCreateChatAndNavigate();
</script>

<template>
  <HomeOverviewRow
    v-for="agent in agents"
    :key="agent.id"
    tall
    @select="createChatAndNavigate(agent.id)"
  >
    <AgentMark :agent-id="agent.id" />
    <span class="flex min-w-0 grow flex-col gap-0.5">
      <span class="truncate text-body font-medium">{{ agent.name }}</span>
      <span class="truncate text-caption text-muted-foreground">{{
        agent.modelName
      }}</span>
    </span>
  </HomeOverviewRow>
</template>
