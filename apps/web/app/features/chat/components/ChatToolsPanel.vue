<script setup lang="ts">
import { getAgentToolIcon } from '~/features/agent/lib/agent-tool-icons';

interface ChatToolsPanelProps {
  toolIds: string[];
  agentId?: string | null;
  agentName?: string;
}

const props = defineProps<ChatToolsPanelProps>();

const { t } = useI18n();

const tools = computed(() =>
  props.toolIds.flatMap((toolId) => {
    const icon = getAgentToolIcon(toolId);
    return icon ? [{ toolId, icon }] : [];
  }),
);
</script>

<template>
  <div class="flex h-13 flex-col justify-center px-3.5">
    <p class="truncate text-body font-medium">
      {{
        agentName
          ? t('chat.tools.title', { agent: agentName })
          : t('chat.tools.titleFallback')
      }}
    </p>
    <p class="text-caption text-muted-foreground">
      {{ t('chat.tools.count', { n: tools.length }, tools.length) }}
    </p>
  </div>
  <ul class="pb-1.5">
    <li
      v-for="{ toolId, icon } in tools"
      :key="toolId"
      class="flex h-11 items-center gap-2.5 px-3.5"
    >
      <Icon :name="icon" class="size-4 shrink-0 text-foreground" />
      <div class="flex min-w-0 flex-col">
        <span class="truncate text-small font-medium">
          {{ t(`agent.tool.${toolId}.label`) }}
        </span>
        <span class="truncate text-caption text-muted-foreground">
          {{ t(`agent.tool.${toolId}.description`) }}
        </span>
      </div>
    </li>
  </ul>
  <NuxtLinkLocale
    v-if="agentId"
    :to="`/agent/${agentId}`"
    class="flex h-10 items-center gap-0.5 border-t px-3.5 text-body font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset"
  >
    {{ t('chat.tools.edit') }}
    <Icon name="hugeicons:arrow-right-01" class="size-3.5" />
  </NuxtLinkLocale>
</template>
