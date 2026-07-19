<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { CodeBlock } from '../code-block';

type ToolPart = ToolUIPart | DynamicToolUIPart;

interface Props extends /* @vue-ignore */ HTMLAttributes {
  input: ToolPart['input'];
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();

const formattedInput = computed(() => {
  return JSON.stringify(props.input, null, 2);
});
</script>

<template>
  <div
    :class="cn('space-y-2 overflow-hidden p-4', props.class)"
    v-bind="$attrs"
  >
    <h4
      class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
    >
      Input
    </h4>
    <div class="rounded-md bg-muted/50">
      <CodeBlock :code="formattedInput" language="json" />
    </div>
  </div>
</template>
