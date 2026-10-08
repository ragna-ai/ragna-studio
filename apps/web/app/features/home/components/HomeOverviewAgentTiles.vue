<script setup lang="ts">
import { BotIcon, PlusIcon } from '@lucide/vue';
import { useCreateChatAndNavigate } from '~/features/chat/composables/useChatApi';
import type { HomeOverviewAgentItem } from '~/features/home/types';

// Props
defineProps<{ agents: HomeOverviewAgentItem[] }>();

// Composables
const { t } = useI18n();
const { createChatAndNavigate } = useCreateChatAndNavigate();
</script>

<template>
  <!-- 2-up tile grid instead of rows (specs/home/prd.md, "Agents card").
       The dashed create tile is always rendered, so an empty list still
       shows a single actionable tile instead of a bare empty message. -->
  <div class="grid grid-cols-2 gap-3">
    <button
      v-for="agent in agents"
      :key="agent.id"
      type="button"
      @click="() => createChatAndNavigate(agent.id)"
      class="flex flex-col gap-2 rounded-xl border border-border p-3 hover:border-foreground/10 hover:bg-accent"
    >
      <div
        class="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"
      >
        <BotIcon class="size-4 stroke-1.5" />
      </div>
      <div class="min-w-0 text-left">
        <p class="truncate text-sm font-medium text-foreground">
          {{ agent.name }}
        </p>
        <p class="truncate text-xs text-muted-foreground">
          {{ agent.modelName }}
        </p>
      </div>
    </button>
    <NuxtLinkLocale
      to="/agent/create"
      class="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-3 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
    >
      <PlusIcon class="size-4" />
      <span class="text-xs font-medium">{{
        t('home.overview.agents.createTile')
      }}</span>
    </NuxtLinkLocale>
  </div>
</template>
