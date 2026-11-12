<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { getAgentToolIcon } from '~/features/agent/lib/agent-tool-icons';

interface AgentToolIconsProps {
  toolIds: string[];
  max?: number;
  /** Slots are buttons that emit `select`; otherwise they only show tooltips. */
  interactive?: boolean;
}

const props = withDefaults(defineProps<AgentToolIconsProps>(), { max: 5 });

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const { t } = useI18n();

const knownTools = computed(() =>
  props.toolIds.flatMap((toolId) => {
    const icon = getAgentToolIcon(toolId);
    return icon
      ? [{ toolId, icon, label: t(`agent.tool.${toolId}.label`) }]
      : [];
  }),
);
const shownTools = computed(() => knownTools.value.slice(0, props.max));
const hiddenCount = computed(
  () => knownTools.value.length - shownTools.value.length,
);
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex items-center">
      <Tooltip v-for="tool in shownTools" :key="tool.toolId">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-xs"
            class="group/tool"
            :aria-label="tool.label"
            :tabindex="interactive ? undefined : -1"
            @click="interactive && emit('select')"
          >
            <Icon
              :name="tool.icon"
              class="text-icon group-hover/tool:text-foreground"
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{{ tool.label }}</TooltipContent>
      </Tooltip>
      <button
        v-if="hiddenCount > 0 && interactive"
        type="button"
        class="rounded-sm pl-1 text-small font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        @click="emit('select')"
      >
        +{{ hiddenCount }}
      </button>
      <span
        v-else-if="hiddenCount > 0"
        class="pl-1 text-small font-medium text-muted-foreground"
      >
        +{{ hiddenCount }}
      </span>
    </div>
  </TooltipProvider>
</template>
