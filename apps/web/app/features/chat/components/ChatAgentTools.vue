<script setup lang="ts">
// Imports
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { getAgentToolVisual } from '~/features/agent/lib/agent-tool-icons';
import ToolIconCircle from '~/features/chat/components/ToolIconCircle.vue';

// Props
interface Props {
  toolIds: string[];
}

const props = defineProps<Props>();

// Computed
const visibleTools = computed(() =>
  props.toolIds.flatMap((toolId) => {
    const visual = getAgentToolVisual(toolId);
    return visual ? [{ toolId, visual }] : [];
  }),
);
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div v-if="visibleTools.length > 0" class="group flex items-center">
      <Tooltip v-for="{ toolId, visual } in visibleTools" :key="toolId">
        <TooltipTrigger as-child>
          <ToolIconCircle
            :icon="visual.icon"
            :color-class="visual.colorClass"
            class="-ml-0.5 transition-[margin] duration-200 group-hover:ml-1 first:ml-0 group-hover:first:ml-0"
          />
        </TooltipTrigger>
        <TooltipContent>{{ $t(`agent.tool.${toolId}.label`) }}</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>
