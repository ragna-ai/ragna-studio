<script setup lang="ts">
import type { WorkflowNode } from '@repo/workflow';
import { XIcon } from '@lucide/vue';
import type { WorkflowRunStep } from '~/features/workflow/types';
import { NODE_TYPE_LABELS } from '~/features/workflow/types/node-data';
import WorkflowRunStatusBadge from '~/features/workflow/components/WorkflowRunStatusBadge.vue';
import WorkflowTraceTimeline from '~/features/workflow/components/WorkflowTraceTimeline.vue';

// Imports

// Props
defineProps<{
  node: WorkflowNode;
  step: WorkflowRunStep | undefined;
}>();

// Emits
const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <aside class="flex h-full w-96 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Badge variant="outline">{{ NODE_TYPE_LABELS[node.type] }}</Badge>
        <WorkflowRunStatusBadge v-if="step" :status="step.status" />
      </div>
      <Button variant="ghost" size="icon" aria-label="Close panel" @click="emit('close')">
        <XIcon class="size-4 stroke-1.5" />
      </Button>
    </div>

    <h3 class="text-sm font-semibold">{{ node.data.label }}</h3>

    <p v-if="!step" class="text-sm text-muted-foreground">
      This node has not run yet.
    </p>
    <template v-else>
      <div v-if="step.input">
        <Label class="mb-2 block text-sm font-medium">Input</Label>
        <pre class="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap">{{ step.input }}</pre>
      </div>
      <div v-if="step.output">
        <Label class="mb-2 block text-sm font-medium">Output</Label>
        <pre class="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap">{{ step.output }}</pre>
      </div>
      <div v-if="step.trace?.length">
        <Label class="mb-2 block text-sm font-medium">Agent trace</Label>
        <WorkflowTraceTimeline :trace="step.trace" />
      </div>
      <div v-if="step.error">
        <Label class="mb-2 block text-sm font-medium text-destructive">Error</Label>
        <pre class="max-h-48 overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs whitespace-pre-wrap">{{ step.error }}</pre>
      </div>
    </template>
  </aside>
</template>
