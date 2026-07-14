<script setup lang="ts">
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, SparklesIcon } from '@lucide/vue';
import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import StatusBadge from './ToolStatusBadge.vue';

type ToolHeaderProps = {
  title?: string;
  class?: HTMLAttributes['class'];
} & (
  | { type: ToolUIPart['type']; state: ToolUIPart['state']; toolName?: never }
  | {
      type: DynamicToolUIPart['type'];
      state: DynamicToolUIPart['state'];
      toolName: string;
    }
);

const props = defineProps<ToolHeaderProps>();

const derivedName = computed(() =>
  props.type === 'dynamic-tool'
    ? props.toolName
    : props.type.split('-').slice(1).join('-'),
);
</script>

<template>
  <CollapsibleTrigger
    :class="
      cn('flex w-full items-center justify-between gap-4 py-3', props.class)
    "
    v-bind="$attrs"
  >
    <div class="flex items-center gap-2">
      <SparklesIcon class="size-4 stroke-1.5 text-muted-foreground" />
      <span class="text-sm font-medium">{{ props.title ?? derivedName }}</span>
      <StatusBadge :state="props.state" />
      <ChevronDownIcon
        class="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
      />
    </div>
  </CollapsibleTrigger>
</template>
