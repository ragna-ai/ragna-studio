<script setup lang="ts">
import { NuxtLinkLocale } from '#components';
import PickerRow from '~/components/PickerRow.vue';
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
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
  <div class="flex items-center gap-2 px-2.5 py-2.5">
    <div class="flex min-w-0 flex-1 flex-col">
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
    <TooltipProvider>
      <Tooltip v-if="agentId">
        <TooltipTrigger as-child>
          <Button
            :as="NuxtLinkLocale"
            :to="`/agent/${agentId}`"
            variant="ghost"
            size="icon-sm"
            class="-mr-1.5"
            leading-icon="hugeicons:settings-01"
            :aria-label="t('chat.tools.edit')"
          />
        </TooltipTrigger>
        <TooltipContent>{{ t('chat.tools.edit') }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
  <ul class="flex flex-col pb-1.5">
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
</template>
