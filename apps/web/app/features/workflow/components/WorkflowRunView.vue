<script setup lang="ts">
import type { WorkflowEdge } from '@repo/workflow';
import { CheckIcon, CopyIcon, Maximize2Icon } from '@lucide/vue';
import {
  useCancelWorkflowRun,
  useGetWorkflow,
  useGetWorkflowRun,
} from '~/features/workflow/composables/useWorkflowApi';
import type { WorkflowRunStep } from '~/features/workflow/types';
import type { RenderableWorkflowNode } from '~/features/workflow/types/node-data';
import WorkflowCanvas from '~/features/workflow/components/WorkflowCanvas.vue';
import WorkflowRunStatusBadge from '~/features/workflow/components/WorkflowRunStatusBadge.vue';
import WorkflowRunStepPanel from '~/features/workflow/components/WorkflowRunStepPanel.vue';
import WorkflowRunTriggerBadge from '~/features/workflow/components/WorkflowRunTriggerBadge.vue';
import { Shimmer } from '~/components/ai-elements/shimmer';
import { MessageResponse } from '~/components/ai-elements/message';

// Imports

// A run only keeps polling while it can still change; every other status
// (completed, failed, cancelled, suspended) is final for the run view.
const ACTIVE_STATUSES = new Set(['pending', 'running']);
const POLL_INTERVAL_MS = 1500;

interface Props {
  runId: string;
}

// Props
const props = defineProps<Props>();

// Refs
const selectedNodeId = ref<string | null>(null);
const isOutputDialogOpen = ref(false);

// Composables
const { data, error: runError } = useGetWorkflowRun(() => props.runId, {
  refetchInterval: (query) => {
    const status = query.state.data?.run.status;
    return status && ACTIVE_STATUSES.has(status) ? POLL_INTERVAL_MS : false;
  },
});
const { mutate: cancelRun, isPending: isCancelling } = useCancelWorkflowRun(() => props.runId);
// For the breadcrumb's workflow-name crumb. Cached when the user arrives
// from the editor; one extra fetch on deep links (e.g. from a notification).
const { data: workflowData } = useGetWorkflow(() => data.value?.run.workflowId ?? '');
const { t } = useI18n();
// No `source` option: this copies the raw run output on demand via
// `copy()`, not a value that's continuously reactive-copied.
const { copy: copyOutput, copied: isOutputCopied } = useClipboard();
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

const selectedNode = computed(
  () => nodes.value.find((node) => node.id === selectedNodeId.value) ?? null,
);
const selectedStep = computed(() =>
  selectedNodeId.value ? stepByNodeId.value.get(selectedNodeId.value) : undefined,
);

const isCancellable = computed(() => !!run.value && ACTIVE_STATUSES.has(run.value.status));

const breadcrumbItems = computed(() => [
  { label: t('workflow.list.title'), to: '/workflow' },
  {
    label: workflowData.value?.workflow.name ?? '…',
    to: run.value ? `/workflow/${run.value.workflowId}` : undefined,
  },
  { label: 'Run' },
]);

// A run with multiple terminal nodes stores its output as a JSON object
// string (keyed by node id, see buildRunOutput in the worker's engine.ts),
// not markdown prose. Detect that case and pretty-print it as code instead
// of trying to render it as markdown.
const multiTerminalOutput = computed(() => {
  if (!run.value?.output) return null;
  try {
    const parsed = JSON.parse(run.value.output);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
});

// Functions
// Sums tool calls across every trace step, so the canvas badge shows the
// step's total regardless of which AI SDK loop step they happened in.
function countTraceToolCalls(step: WorkflowRunStep | undefined): number | undefined {
  if (!step?.trace) return undefined;
  return step.trace.reduce((total, traceStep) => total + traceStep.toolCalls.length, 0);
}
</script>

<template>
  <div v-if="run" class="flex h-full flex-col">
    <header class="flex flex-col gap-2 border-b px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="min-w-0">
          <PageBreadcrumb :items="breadcrumbItems" />
          <p class="text-xs text-muted-foreground">{{ formatDateTime(run.createdAt) }}</p>
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
      <div v-if="run.input || run.output || run.error" class="grid gap-3 text-xs sm:grid-cols-3">
        <div v-if="run.input" class="min-w-0">
          <p class="font-medium text-muted-foreground">Input</p>
          <p class="truncate">{{ run.input }}</p>
        </div>
        <div v-if="run.output" class="min-w-0">
          <p class="font-medium text-muted-foreground">Output</p>
          <button
            type="button"
            class="flex w-full min-w-0 items-center gap-1 rounded-sm text-left text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="isOutputDialogOpen = true"
          >
            <span class="truncate">{{ run.output }}</span>
            <Maximize2Icon class="size-3 shrink-0 text-muted-foreground" />
          </button>
        </div>
        <div v-if="run.error" class="min-w-0">
          <p class="font-medium text-destructive">Error</p>
          <p class="truncate text-destructive">{{ run.error }}</p>
        </div>
      </div>
    </header>

    <Dialog v-model:open="isOutputDialogOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run output</DialogTitle>
        </DialogHeader>
        <div class="relative">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            class="absolute top-2 right-2 z-10"
            aria-label="Copy output"
            @click="copyOutput(run.output ?? '')"
          >
            <component :is="isOutputCopied ? CheckIcon : CopyIcon" class="size-3.5 stroke-1.5" />
          </Button>
          <div class="max-h-[70vh] overflow-y-auto rounded-md border bg-muted p-3 text-sm">
            <pre
              v-if="multiTerminalOutput"
              class="text-xs whitespace-pre-wrap"
            >{{ JSON.stringify(multiTerminalOutput, null, 2) }}</pre>
            <MessageResponse
              v-else
              :content="run.output ?? ''"
              class="text-sm [&_:is(h1,h2,h3,h4,h5,h6)]:mt-3 [&_:is(h1,h2,h3,h4,h5,h6)]:text-sm!"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>

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
