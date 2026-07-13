<script setup lang="ts">
import type { WorkflowEdge } from '@repo/workflow';
import { useGetWorkflowRun } from '~/features/workflow/composables/useWorkflowApi';
import type { RenderableWorkflowNode } from '~/features/workflow/types/node-data';
import WorkflowCanvas from '~/features/workflow/components/WorkflowCanvas.vue';
import WorkflowRunStatusBadge from '~/features/workflow/components/WorkflowRunStatusBadge.vue';
import WorkflowRunStepPanel from '~/features/workflow/components/WorkflowRunStepPanel.vue';
import { Shimmer } from '~/components/ai-elements/shimmer';

// Imports

const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const POLL_INTERVAL_MS = 1500;

interface Props {
  runId: string;
}

// Props
const props = defineProps<Props>();

// Refs
const selectedNodeId = ref<string | null>(null);

// Composables
const { data, error: runError } = useGetWorkflowRun(() => props.runId, {
  refetchInterval: (query) => {
    const status = query.state.data?.run.status;
    return status && !TERMINAL_STATUSES.has(status) ? POLL_INTERVAL_MS : false;
  },
});

// Computed
const run = computed(() => data.value?.run ?? null);

const stepByNodeId = computed(() => {
  const steps = run.value?.steps ?? [];
  return new Map(steps.map((step) => [step.nodeId, step]));
});

// The canvas is read-only here, but WorkflowCanvas still expects writable
// v-model:nodes/edges (VueFlow syncs measured dimensions back on mount even
// when dragging is disabled). The setters are intentional no-ops: the run's
// step data is the only source of truth.
const nodes = computed<RenderableWorkflowNode[]>({
  get: () =>
    (run.value?.definition.nodes ?? []).map((node) => ({
      ...node,
      data: { ...node.data, stepStatus: stepByNodeId.value.get(node.id)?.status },
    })),
  set: () => {},
});
const edges = computed<WorkflowEdge[]>({
  get: () => run.value?.definition.edges ?? [],
  set: () => {},
});

const selectedNode = computed(
  () => nodes.value.find((node) => node.id === selectedNodeId.value) ?? null,
);
const selectedStep = computed(() =>
  selectedNodeId.value ? stepByNodeId.value.get(selectedNodeId.value) : undefined,
);

// Functions
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(isoDate: string) {
  return dateTimeFormatter.format(new Date(isoDate));
}
</script>

<template>
  <div v-if="run" class="flex h-full flex-col">
    <header class="flex flex-col gap-2 border-b px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-sm font-semibold">Run</h1>
          <p class="text-xs text-muted-foreground">{{ formatDateTime(run.createdAt) }}</p>
        </div>
        <WorkflowRunStatusBadge :status="run.status" />
      </div>
      <div v-if="run.input || run.output || run.error" class="grid gap-3 text-xs sm:grid-cols-3">
        <div v-if="run.input" class="min-w-0">
          <p class="font-medium text-muted-foreground">Input</p>
          <p class="truncate">{{ run.input }}</p>
        </div>
        <div v-if="run.output" class="min-w-0">
          <p class="font-medium text-muted-foreground">Output</p>
          <p class="truncate">{{ run.output }}</p>
        </div>
        <div v-if="run.error" class="min-w-0">
          <p class="font-medium text-destructive">Error</p>
          <p class="truncate text-destructive">{{ run.error }}</p>
        </div>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <div class="min-w-0 flex-1">
        <WorkflowCanvas
          v-model:nodes="nodes"
          v-model:edges="edges"
          readonly
          @select-node="selectedNodeId = $event"
        />
      </div>

      <WorkflowRunStepPanel
        v-if="selectedNode"
        :key="selectedNode.id"
        :node="selectedNode"
        :step="selectedStep"
        @close="selectedNodeId = null"
      />
    </div>
  </div>
  <div v-else-if="runError" class="flex h-full w-full items-center justify-center">
    <p class="text-sm text-stone-500">
      {{ runError.message || 'An error occurred while fetching the run.' }}
    </p>
  </div>
  <div v-else class="flex h-full w-full items-center justify-center">
    <Shimmer class="h-6 w-48"> Loading run... </Shimmer>
  </div>
</template>
