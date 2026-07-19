<script setup lang="ts">
import type { WorkflowEdge } from '@repo/workflow';
import { Shimmer } from '~/components/ai-elements/shimmer';
import WorkflowCanvas from '~/features/workflow/components/WorkflowCanvas.vue';
import WorkflowRunStatusBadge from '~/features/workflow/components/WorkflowRunStatusBadge.vue';
import WorkflowRunStepDialog from '~/features/workflow/components/WorkflowRunStepDialog.vue';
import WorkflowRunTriggerBadge from '~/features/workflow/components/WorkflowRunTriggerBadge.vue';
import {
  useCancelWorkflowRun,
  useGetWorkflow,
  useGetWorkflowRun,
} from '~/features/workflow/composables/useWorkflowApi';
import type { WorkflowRunStep } from '~/features/workflow/types';
import type { RenderableWorkflowNode } from '~/features/workflow/types/node-data';

// A run only keeps polling while it can still change; every other status
// (completed, failed, cancelled, suspended) is final for the run view.
const ACTIVE_STATUSES = new Set(['pending', 'running']);
const POLL_INTERVAL_MS = 1500;

interface Props {
  workspaceId: string;
  workflowId: string;
  runId: string;
}

// Props
const props = defineProps<Props>();

// Refs
const selectedNodeId = ref<string | null>(null);

// Composables
const { data, error: runError } = useGetWorkflowRun(
  () => props.workspaceId,
  () => props.workflowId,
  () => props.runId,
  {
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status && ACTIVE_STATUSES.has(status) ? POLL_INTERVAL_MS : false;
    },
  },
);
const { mutate: cancelRun, isPending: isCancelling } = useCancelWorkflowRun(
  () => props.workspaceId,
  () => props.workflowId,
  () => props.runId,
);
// For the breadcrumb's workflow-name crumb.
const { data: workflowData } = useGetWorkflow(
  () => props.workspaceId,
  () => props.workflowId,
);
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

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
    (run.value?.definition.nodes ?? []).map((node) => {
      const step = stepByNodeId.value.get(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          stepStatus: step?.status,
          stepToolCallCount: countTraceToolCalls(step),
        },
      };
    }),
  set: () => {},
});
const edges = computed<WorkflowEdge[]>({
  get: () => run.value?.definition.edges ?? [],
  set: () => {},
});

const isCancellable = computed(
  () => !!run.value && ACTIVE_STATUSES.has(run.value.status),
);

const breadcrumbItems = computed(() => [
  { label: t('workflow.list.title'), to: '/workflow' },
  {
    label: workflowData.value?.workflow.name ?? '…',
    to: run.value ? `/workflow/${run.value.workflowId}` : undefined,
  },
  { label: 'Run' },
]);

// Functions
// Sums tool calls across every trace step, so the canvas badge shows the
// step's total regardless of which AI SDK loop step they happened in.
function countTraceToolCalls(
  step: WorkflowRunStep | undefined,
): number | undefined {
  if (!step?.trace) return undefined;
  return step.trace.reduce(
    (total, traceStep) => total + traceStep.toolCalls.length,
    0,
  );
}
</script>

<template>
  <div v-if="run" class="flex h-full flex-col">
    <header class="flex flex-col gap-2 border-b px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="min-w-0">
          <PageBreadcrumb :items="breadcrumbItems" />
          <p class="text-xs text-muted-foreground">
            {{ formatDateTime(run.createdAt) }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <WorkflowRunTriggerBadge :trigger="run.triggeredBy" />
          <WorkflowRunStatusBadge :status="run.status" />
          <Button
            v-if="isCancellable"
            variant="outline"
            size="sm"
            :disabled="isCancelling"
            @click="cancelRun()"
          >
            Cancel run
          </Button>
        </div>
      </div>
      <div
        v-if="run.input || run.output || run.error"
        class="grid gap-3 text-xs sm:grid-cols-3"
      >
        <div v-if="run.input" class="min-w-0">
          <p class="font-medium text-muted-foreground">Input</p>
          <p class="truncate">{{ run.input }}</p>
        </div>
        <div v-if="run.error" class="min-w-0">
          <p class="font-medium text-destructive">Error</p>
          <p class="truncate text-destructive">{{ run.error }}</p>
        </div>
      </div>
    </header>

    <WorkflowRunStepDialog
      v-model:node-id="selectedNodeId"
      :nodes="nodes"
      :step-by-node-id="stepByNodeId"
    />

    <div class="flex min-h-0 flex-1">
      <div class="min-w-0 flex-1">
        <WorkflowCanvas
          v-model:nodes="nodes"
          v-model:edges="edges"
          readonly
          @select-node="selectedNodeId = $event"
        />
      </div>
    </div>
  </div>
  <div
    v-else-if="runError"
    class="flex h-full w-full items-center justify-center"
  >
    <p class="text-sm text-stone-500">
      {{ runError.message || 'An error occurred while fetching the run.' }}
    </p>
  </div>
  <div v-else class="flex h-full w-full items-center justify-center">
    <Shimmer class="h-6 w-48"> Loading run... </Shimmer>
  </div>
</template>
