<script setup lang="ts">
import { useCreateChatAndNavigate } from '~/features/chat/composables/useChatApi';
import HomeOverviewRow from '~/features/home/components/HomeOverviewRow.vue';
import { AGENT_TONE_CLASS, agentTone } from '~/features/home/lib/dashboard';
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
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-md"
      :class="AGENT_TONE_CLASS[agentTone(agent.id)]"
    >
      <Icon name="hugeicons:robotic" class="size-4" />
    </span>
    <span class="flex min-w-0 grow flex-col gap-0.5">
      <span class="truncate text-body font-medium">{{ agent.name }}</span>
      <span class="truncate text-caption text-muted-foreground">{{
        agent.modelName
      }}</span>
    </span>
  </HomeOverviewRow>
</template>
