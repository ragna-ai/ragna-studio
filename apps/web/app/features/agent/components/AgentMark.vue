<script setup lang="ts">
import { AGENT_TONE_CLASS, agentTone } from '~/features/agent/lib/agent-tone';
import { cn } from '~/lib/utils';

export type AgentMarkSize = 20 | 24 | 28;

interface AgentMarkProps {
  agentId: string;
  size?: AgentMarkSize;
}

const props = withDefaults(defineProps<AgentMarkProps>(), { size: 28 });

const SIZE_CLASS: Record<AgentMarkSize, { box: string; icon: string }> = {
  20: { box: 'size-5 rounded-sm', icon: 'size-3' },
  24: { box: 'size-6 rounded-[7px]', icon: 'size-3.5' },
  28: { box: 'size-7 rounded-md', icon: 'size-4' },
};

const toneClass = computed(() => AGENT_TONE_CLASS[agentTone(props.agentId)]);
</script>

<template>
  <span
    :class="
      cn(
        'flex shrink-0 items-center justify-center',
        SIZE_CLASS[props.size].box,
        toneClass,
      )
    "
    aria-hidden="true"
  >
    <Icon name="hugeicons:robotic" :class="SIZE_CLASS[props.size].icon" />
  </span>
</template>
