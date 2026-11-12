<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '~/components/ui/popover';
import { Separator } from '~/components/ui/separator';
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
    <Separator
      orientation="vertical"
      class="mr-2 ml-1 data-[orientation=vertical]:h-4"
    />
    <Popover v-model:open="isOpen">
      <TooltipProvider :delay-duration="300">
        <PopoverAnchor as-child>
          <div class="flex h-8 items-center pr-1.5">
            <Tooltip v-for="{ toolId, icon } in shownTools" :key="toolId">
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :aria-label="t(`agent.tool.${toolId}.label`)"
                  class="group/tool"
                  @click="isOpen = !isOpen"
                >
                  <Icon
                    :name="icon"
                    class="text-icon group-hover/tool:text-foreground"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
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
      <PopoverContent side="top" align="start" padding="list" class="w-90">
        <ChatToolsPanel
          :tool-ids="toolIds"
          :agent-id="agentId"
          :agent-name="agentName"
        />
      </PopoverContent>
    </Popover>
  </template>
</template>
