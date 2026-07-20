<script setup lang="ts">
import type { WorkflowAgentTraceStep } from '@repo/workflow';
import { tokenUsageTotal } from '~/features/workflow/lib/format-trace';
import WorkflowToolCallList from '~/features/workflow/components/WorkflowToolCallList.vue';

// Imports

// Props
defineProps<{
  trace: WorkflowAgentTraceStep[];
}>();

// Composables
const { t } = useI18n();
</script>

<template>
  <ol class="space-y-4">
    <li
      v-for="(traceStep, index) in trace"
      :key="index"
      class="space-y-2 border-l-2 border-muted pl-3"
    >
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-muted-foreground">{{ t('workflow.trace.step', { number: index + 1 }) }}</span>
        <Badge
          v-if="tokenUsageTotal(traceStep.usage) !== undefined"
          variant="outline"
          class="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
        >
          {{ t('workflow.trace.tokenCount', { count: tokenUsageTotal(traceStep.usage) }) }}
        </Badge>
      </div>

      <p
        v-if="traceStep.text"
        class="rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-wrap"
      >
        {{ traceStep.text }}
      </p>

      <WorkflowToolCallList
        v-if="traceStep.toolCalls.length"
        :tool-calls="traceStep.toolCalls"
        :id-prefix="`trace-${index}`"
      />
    </li>
  </ol>
</template>
