<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { computed } from 'vue';
import { useReasoningContext } from './context';

interface Props {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();

const { t } = useI18n();
const { isStreaming, duration } = useReasoningContext();

const label = computed(() => {
  if (isStreaming.value) return t('chat.message.reasoning.thinking');
  if (!duration.value) return t('chat.message.reasoning.thought');
  return t('chat.message.reasoning.thoughtFor', { n: duration.value });
});
</script>

<template>
  <CollapsibleTrigger
    :class="
      cn(
        'group/line flex h-6 items-center gap-1.5 rounded-sm text-left text-small focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden',
        isStreaming ? 'text-agent-text' : 'text-muted-foreground',
        props.class,
      )
    "
  >
    <slot>
      <span class="flex size-4 shrink-0 items-center justify-center">
        <Icon
          name="hugeicons:ai-brain-01"
          class="size-3.5"
          :class="isStreaming ? 'text-agent' : 'text-icon'"
        />
      </span>
      <span class="truncate">{{ label }}</span>
      <Icon
        name="hugeicons:arrow-right-01"
        class="size-3.5 shrink-0 text-icon transition-transform group-data-[state=open]/line:rotate-90"
      />
    </slot>
  </CollapsibleTrigger>
</template>
