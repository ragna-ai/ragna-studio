<script setup lang="ts">
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '~/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { getAgentToolIcon } from '~/features/agent/lib/agent-tool-icons';
import ChatToolsPanel from '~/features/chat/components/ChatToolsPanel.vue';

const MAX_VISIBLE_TOOLS = 10;

interface ChatAgentToolsProps {
  toolIds: string[];
  agentId?: string | null;
  agentName?: string;
}

const props = defineProps<ChatAgentToolsProps>();

const { t } = useI18n();

const isOpen = ref(false);

const visibleTools = computed(() =>
  props.toolIds.flatMap((toolId) => {
    const icon = getAgentToolIcon(toolId);
    return icon ? [{ toolId, icon }] : [];
  }),
);
const shownTools = computed(() =>
  visibleTools.value.slice(0, MAX_VISIBLE_TOOLS),
);
const hiddenCount = computed(
  () => visibleTools.value.length - shownTools.value.length,
);
</script>

<template>
  <template v-if="visibleTools.length > 0">
    <span class="mr-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
    <Popover v-model:open="isOpen">
      <TooltipProvider :delay-duration="300">
        <PopoverAnchor as-child>
          <div class="flex h-8 items-center pr-1.5 pl-1">
            <Tooltip v-for="{ toolId, icon } in shownTools" :key="toolId">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  :aria-label="t(`agent.tool.${toolId}.label`)"
                  class="group/tool flex size-6 items-center justify-center rounded-sm transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                  @click="isOpen = !isOpen"
                >
                  <Icon
                    :name="icon"
                    class="size-4 text-icon group-hover/tool:text-foreground"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                class="flex h-7 items-center rounded-sm px-2.5 py-0 text-caption font-medium text-primary-foreground"
              >
                {{ t(`agent.tool.${toolId}.label`) }}
              </TooltipContent>
            </Tooltip>
            <button
              v-if="hiddenCount > 0"
              type="button"
              class="ml-1 rounded-sm text-small font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
              @click="isOpen = !isOpen"
            >
              +{{ hiddenCount }}
            </button>
          </div>
        </PopoverAnchor>
      </TooltipProvider>
      <PopoverContent
        side="top"
        align="start"
        :side-offset="8"
        class="w-90 overflow-hidden rounded-lg border bg-popover p-0 shadow-popover"
      >
        <ChatToolsPanel
          :tool-ids="toolIds"
          :agent-id="agentId"
          :agent-name="agentName"
        />
      </PopoverContent>
    </Popover>
  </template>
</template>
