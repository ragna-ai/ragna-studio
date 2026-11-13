<script setup lang="ts">
import { AGENT_MARK_ICONS } from '@repo/ai/client';
import {
  AGENT_TONE_CLASS,
  fallbackAgentTone,
  isAgentMarkTone,
} from '~/features/agent/lib/agent-tone';
import { cn } from '~/lib/utils';

export type AgentMarkSize = 16 | 20 | 24 | 28 | 40;

interface AgentMarkProps {
  agentId?: string;
  icon?: string | null;
  tone?: string | null;
  imageUrl?: string | null;
  size?: AgentMarkSize;
}

const props = withDefaults(defineProps<AgentMarkProps>(), { size: 28 });

const SIZE_CLASS: Record<AgentMarkSize, { box: string; icon: string }> = {
  16: { box: 'size-4 rounded-sm', icon: 'size-2.5' },
  20: { box: 'size-5 rounded-sm', icon: 'size-3' },
  24: { box: 'size-6 rounded-sm', icon: 'size-3.5' },
  28: { box: 'size-7 rounded-md', icon: 'size-4' },
  40: { box: 'size-10 rounded-md', icon: 'size-5' },
};

const DEFAULT_ICON = 'robotic';

// Refs
const imageFailed = ref(false);

// Computed
const shownImageUrl = computed(() =>
  imageFailed.value ? null : (props.imageUrl ?? null),
);
const iconName = computed(
  () => AGENT_MARK_ICONS.find((name) => name === props.icon) ?? DEFAULT_ICON,
);
const toneName = computed(() =>
  isAgentMarkTone(props.tone) ? props.tone : fallbackAgentTone(props.agentId),
);
const toneClass = computed(() => AGENT_TONE_CLASS[toneName.value]);

// Hooks
watch(
  () => props.imageUrl,
  () => (imageFailed.value = false),
);
</script>

<template>
  <span
    v-if="shownImageUrl"
    data-slot="agent-mark"
    data-kind="image"
    :class="
      cn(
        'relative block shrink-0 overflow-hidden after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-border',
        SIZE_CLASS[props.size].box,
      )
    "
    aria-hidden="true"
  >
    <img
      :src="shownImageUrl"
      alt=""
      class="size-full object-cover"
      @error="imageFailed = true"
    />
  </span>
  <span
    v-else
    data-slot="agent-mark"
    data-kind="icon"
    :data-icon="iconName"
    :data-tone="toneName"
    :class="
      cn(
        'flex shrink-0 items-center justify-center',
        SIZE_CLASS[props.size].box,
        toneClass,
      )
    "
    aria-hidden="true"
  >
    <Icon
      :name="`hugeicons:${iconName}`"
      :class="SIZE_CLASS[props.size].icon"
    />
  </span>
</template>
