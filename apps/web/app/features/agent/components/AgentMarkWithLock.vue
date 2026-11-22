<script setup lang="ts">
import AgentMark, {
  type AgentMarkSize,
} from '~/features/agent/components/AgentMark.vue';
import {
  agentLockStateIconName,
  useAgentLockSummary,
} from '~/features/agent/composables/useAgentLockSummary';
import type { AgentLock } from '~/features/agent/types';

interface Props {
  agentId?: string;
  icon?: string | null;
  tone?: string | null;
  imageUrl?: string | null;
  size?: AgentMarkSize;
  lock: AgentLock | null | undefined;
}

const BADGE_CLASS: Record<AgentMarkSize, { box: string; icon: string }> = {
  16: { box: 'size-2.5', icon: 'size-2' },
  20: { box: 'size-3', icon: 'size-2' },
  24: { box: 'size-3.5', icon: 'size-2.5' },
  28: { box: 'size-4', icon: 'size-3' },
  40: { box: 'size-5', icon: 'size-3.5' },
};

// Props
const props = withDefaults(defineProps<Props>(), { size: 28 });

// Composables
const summary = useAgentLockSummary(() => props.lock);

// Computed
const badgeClass = computed(() => BADGE_CLASS[props.size]);
</script>

<template>
  <div class="relative shrink-0">
    <AgentMark
      :agent-id="props.agentId"
      :icon="props.icon"
      :tone="props.tone"
      :image-url="props.imageUrl"
      :size="props.size"
    />
    <TooltipProvider v-if="props.lock" :delay-duration="300">
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            role="img"
            :aria-label="summary"
            :class="[
              'absolute -right-1 -bottom-1 flex shrink-0 items-center justify-center rounded-full bg-background text-foreground',
              badgeClass.box,
            ]"
          >
            <Icon
              :name="agentLockStateIconName(props.lock)"
              :class="['shrink-0', badgeClass.icon]"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{{ summary }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>
