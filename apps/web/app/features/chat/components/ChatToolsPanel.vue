<script setup lang="ts">
import PickerRow from '~/components/PickerRow.vue';
import { Separator } from '~/components/ui/separator';
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
  <div class="flex flex-col px-2.5 py-1.5">
    <p class="truncate text-small font-medium">
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
  <ul class="flex flex-col">
    <li
      v-for="{ toolId, icon } in tools"
      :key="toolId"
      class="flex min-h-9 items-center px-2.5"
    >
      <PickerRow
        :title="t(`agent.tool.${toolId}.label`)"
        :hint="t(`agent.tool.${toolId}.description`)"
      >
        <template #lead>
          <Icon :name="icon" class="size-4 shrink-0 text-icon" />
        </template>
      </PickerRow>
    </li>
  </ul>
  <template v-if="agentId">
    <Separator class="my-1.5" />
    <NuxtLinkLocale
      :to="`/agent/${agentId}`"
      class="flex min-h-9 items-center rounded-md px-2.5 text-body font-medium text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset"
    >
      {{ t('chat.tools.edit') }}
      <Icon name="hugeicons:arrow-right-01" class="ml-0.5 size-3.5" />
    </NuxtLinkLocale>
  </template>
</template>
