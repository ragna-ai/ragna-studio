<script setup lang="ts">
import type { WorkflowToolCall } from '@repo/workflow';
import { SparklesIcon } from '@lucide/vue';
import { formatDurationMs, formatTokenUsage } from '~/features/workflow/lib/format-trace';

// Imports

// Props
// `idPrefix` keeps accordion item values unique across nesting levels: a
// delegate call's own tool calls render through this same component again,
// so a plain index would collide with the parent level's item values.
const props = withDefaults(
  defineProps<{
    toolCalls: WorkflowToolCall[];
    idPrefix?: string;
  }>(),
  { idPrefix: 'tool-call' },
);

// Functions
// Tool call input/output are opaque JSON values from the AI SDK (unlike a
// step's plain-string input/output), so they need explicit pretty-printing.
function formatToolValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
</script>

<template>
  <Accordion type="multiple" class="rounded-md border">
    <AccordionItem
      v-for="(toolCall, index) in toolCalls"
      :key="index"
      :value="`${props.idPrefix}-${index}`"
      class="px-2"
    >
      <AccordionTrigger class="py-2 text-xs hover:no-underline">
        <span class="flex min-w-0 items-center gap-2">
          <SparklesIcon class="size-3.5 shrink-0 stroke-1.5 text-muted-foreground" />
          <Badge variant="secondary" class="font-normal">{{ toolCall.toolName }}</Badge>
          <Badge
            v-if="toolCall.durationMs !== undefined"
            variant="outline"
            class="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
          >
            {{ formatDurationMs(toolCall.durationMs) }}
          </Badge>
          <Badge
            v-if="formatTokenUsage(toolCall.usage)"
            variant="outline"
            class="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
          >
            {{ formatTokenUsage(toolCall.usage) }}
          </Badge>
          <span v-if="toolCall.error" class="text-destructive">Failed</span>
        </span>
      </AccordionTrigger>
      <AccordionContent class="space-y-2 pb-3">
        <div>
          <p class="mb-1 text-xs font-medium text-muted-foreground">Input</p>
          <pre class="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap">{{ formatToolValue(toolCall.input) }}</pre>
        </div>
        <div v-if="toolCall.output !== undefined && toolCall.output !== null">
          <p class="mb-1 text-xs font-medium text-muted-foreground">Output</p>
          <pre class="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap">{{ formatToolValue(toolCall.output) }}</pre>
        </div>
        <div v-if="toolCall.error">
          <p class="mb-1 text-xs font-medium text-destructive">Error</p>
          <pre class="max-h-48 overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs whitespace-pre-wrap">{{ toolCall.error }}</pre>
        </div>
        <div v-if="toolCall.calls?.length" class="pl-3">
          <p class="mb-1 text-xs font-medium text-muted-foreground">Member tool calls</p>
          <WorkflowToolCallList
            :tool-calls="toolCall.calls"
            :id-prefix="`${props.idPrefix}-${index}`"
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
</template>
