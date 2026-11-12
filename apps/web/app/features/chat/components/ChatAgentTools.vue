<script setup lang="ts">
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '~/components/ui/popover';
import { Separator } from '~/components/ui/separator';
import AgentToolIcons from '~/features/agent/components/AgentToolIcons.vue';
import { getAgentToolIcon } from '~/features/agent/lib/agent-tool-icons';
import ChatToolsPanel from '~/features/chat/components/ChatToolsPanel.vue';

const MAX_VISIBLE_TOOLS = 10;

interface ChatAgentToolsProps {
  toolIds: string[];
  agentId?: string | null;
  agentName?: string;
}

const props = defineProps<ChatAgentToolsProps>();

const isOpen = ref(false);

const hasVisibleTools = computed(() =>
  props.toolIds.some((toolId) => getAgentToolIcon(toolId)),
);
</script>

<template>
  <template v-if="hasVisibleTools">
    <Separator
      orientation="vertical"
      class="mr-2 ml-1 data-[orientation=vertical]:h-4"
    />
    <Popover v-model:open="isOpen">
      <PopoverAnchor as-child>
        <div class="flex h-8 items-center pr-1.5">
          <AgentToolIcons
            :tool-ids="toolIds"
            :max="MAX_VISIBLE_TOOLS"
            interactive
            @select="isOpen = !isOpen"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        padding="list"
        class="w-90"
        @open-auto-focus.prevent
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
