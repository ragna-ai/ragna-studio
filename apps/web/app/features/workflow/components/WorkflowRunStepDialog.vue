<script setup lang="ts">
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
} from '@lucide/vue';
import MessageResponse from '~/components/ai-elements/message/MessageResponse.vue';
import WorkflowRunStatusBadge from '~/features/workflow/components/WorkflowRunStatusBadge.vue';
import WorkflowTraceTimeline from '~/features/workflow/components/WorkflowTraceTimeline.vue';
import type { WorkflowRunStep } from '~/features/workflow/types';
import type { RenderableWorkflowNode } from '~/features/workflow/types/node-data';
import { NODE_TYPE_LABEL_KEYS } from '~/features/workflow/types/node-data';

// Props
// `nodes` is the run definition's full node list, in definition order, used
// for previous/next navigation; `stepByNodeId` looks up each node's result.
const props = defineProps<{
  nodes: RenderableWorkflowNode[];
  stepByNodeId: Map<string, WorkflowRunStep>;
}>();

// Refs
const nodeId = defineModel<string | null>('nodeId', { default: null });

// Composables
const { copy: copyOutput, copied: isOutputCopied } = useClipboard();
const { t } = useI18n();

// Computed
const isOpen = computed({
  get: () => nodeId.value !== null,
  set: (value) => {
    if (!value) nodeId.value = null;
  },
});

const currentIndex = computed(() =>
  props.nodes.findIndex((node) => node.id === nodeId.value),
);
const selectedNode = computed(() =>
  currentIndex.value >= 0 ? props.nodes[currentIndex.value] : null,
);
const selectedStep = computed(() =>
  selectedNode.value
    ? props.stepByNodeId.get(selectedNode.value.id)
    : undefined,
);
const canGoPrevious = computed(() => currentIndex.value > 0);
const canGoNext = computed(
  () => currentIndex.value >= 0 && currentIndex.value < props.nodes.length - 1,
);

// Functions
function goToPrevious() {
  if (!canGoPrevious.value) return;
  nodeId.value = props.nodes[currentIndex.value - 1]!.id;
}

function goToNext() {
  if (!canGoNext.value) return;
  nodeId.value = props.nodes[currentIndex.value + 1]!.id;
}

// A plain keydown listener on the dialog content: Escape and the accordion's
// own up/down focus handling are untouched, this only reacts to left/right.
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goToPrevious();
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    goToNext();
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-w-4xl min-w-3xl" @keydown="handleKeydown">
      <DialogHeader>
        <div class="flex items-center justify-between gap-4 pr-8">
          <div class="flex min-w-0 items-center gap-2">
            <DialogTitle class="truncate">{{
              selectedNode?.data.label
            }}</DialogTitle>
            <Badge v-if="selectedNode" variant="outline">
              {{ t(NODE_TYPE_LABEL_KEYS[selectedNode.type]) }}
            </Badge>
            <WorkflowRunStatusBadge
              v-if="selectedStep"
              :status="selectedStep.status"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              :disabled="!canGoPrevious"
              :aria-label="t('workflow.runStepDialog.previousNode')"
              @click="goToPrevious"
            >
              <ChevronLeftIcon class="size-4 stroke-1.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              :disabled="!canGoNext"
              :aria-label="t('workflow.runStepDialog.nextNode')"
              @click="goToNext"
            >
              <ChevronRightIcon class="size-4 stroke-1.5" />
            </Button>
          </div>
        </div>
      </DialogHeader>

      <div class="-mx-5 max-h-[75vh] space-y-4 overflow-y-auto px-5">
        <p v-if="!selectedStep" class="text-sm text-muted-foreground">
          {{ t('workflow.runStepDialog.notRunYet') }}
        </p>
        <template v-else>
          <div v-if="selectedStep.input">
            <Label class="mb-2 block text-sm font-medium">{{
              t('common.input')
            }}</Label>
            <pre
              class="max-h-[40vh] overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap"
              >{{ selectedStep.input }}</pre>
          </div>
          <div v-if="selectedStep.output">
            <Label class="mb-2 block text-sm font-medium">{{
              t('common.output')
            }}</Label>
            <div class="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="absolute top-2 right-2 z-10"
                :aria-label="t('workflow.runStepDialog.copyOutput')"
                @click="copyOutput(selectedStep.output ?? '')"
              >
                <component
                  :is="isOutputCopied ? CheckIcon : CopyIcon"
                  class="size-3.5 stroke-1.5"
                />
              </Button>

              <div
                class="max-h-[40vh] overflow-y-auto rounded-md border bg-muted p-3 text-sm"
              >
                <MessageResponse
                  :content="selectedStep.output"
                  class="text-sm [&_:is(h1,h2,h3,h4,h5,h6)]:mt-3 [&_:is(h1,h2,h3,h4,h5,h6)]:text-sm!"
                />
              </div>
            </div>
          </div>
          <div v-if="selectedStep.trace?.length">
            <Label class="mb-2 block text-sm font-medium">{{
              t('workflow.runStepDialog.agentTrace')
            }}</Label>
            <WorkflowTraceTimeline :trace="selectedStep.trace" />
          </div>
          <div v-if="selectedStep.error">
            <Label class="mb-2 block text-sm font-medium text-destructive">{{
              t('common.error')
            }}</Label>
            <pre
              class="max-h-[40vh] overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs whitespace-pre-wrap"
              >{{ selectedStep.error }}</pre>
          </div>
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>
