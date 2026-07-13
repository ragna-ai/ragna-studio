<script setup lang="ts">
import type { WorkflowEdge, WorkflowNode, WorkflowNodeType } from '@repo/workflow';
import { PlayIcon } from '@lucide/vue';
import {
  usePublishWorkflow,
  useUpsertWorkflow,
} from '~/features/workflow/composables/useWorkflowApi';
import { createWorkflowNode, nextFreePosition } from '~/features/workflow/lib/default-node';
import { toWorkflowDefinition } from '~/features/workflow/lib/serialize-definition';
import type { Workflow } from '~/features/workflow/types';
import WorkflowCanvas from '~/features/workflow/components/WorkflowCanvas.vue';
import WorkflowNodeConfigPanel from '~/features/workflow/components/WorkflowNodeConfigPanel.vue';
import WorkflowNodePalette from '~/features/workflow/components/WorkflowNodePalette.vue';
import WorkflowRunDialog from '~/features/workflow/components/WorkflowRunDialog.vue';
import WorkflowRunsList from '~/features/workflow/components/WorkflowRunsList.vue';

// Imports

interface Props {
  workflow: Workflow;
}

// Props
const props = defineProps<Props>();

// Refs
// `workflow` comes from the vue-query cache, which is a readonly proxy, and
// its arrays are replaced wholesale on every refetch. The canvas needs its
// own mutable copy to edit locally and only push back on Save.
const nodes = ref<WorkflowNode[]>(
  structuredClone(toRaw(props.workflow.definition.nodes)),
);
const edges = ref<WorkflowEdge[]>(
  structuredClone(toRaw(props.workflow.definition.edges)),
);
const selectedNodeId = ref<string | null>(null);
const isRunDialogOpen = ref(false);
const isRunsListOpen = ref(false);

// Composables
const { mutateAsync: saveWorkflow, isPending: isSaving } = useUpsertWorkflow();
const { mutateAsync: publishWorkflow, isPending: isPublishing } = usePublishWorkflow();

// Computed
const selectedNode = computed(
  () => nodes.value.find((node) => node.id === selectedNodeId.value) ?? null,
);

// Functions
function addNode(type: WorkflowNodeType) {
  const node = createWorkflowNode(type, nextFreePosition(nodes.value.length));
  nodes.value.push(node);
  selectedNodeId.value = node.id;
}

function deleteSelectedNode() {
  const nodeId = selectedNodeId.value;
  if (!nodeId) {
    return;
  }
  nodes.value = nodes.value.filter((node) => node.id !== nodeId);
  edges.value = edges.value.filter(
    (edge) => edge.source !== nodeId && edge.target !== nodeId,
  );
  selectedNodeId.value = null;
}

async function handleSave() {
  await saveWorkflow({
    id: props.workflow.id,
    name: props.workflow.name,
    description: props.workflow.description ?? undefined,
    definition: toWorkflowDefinition(nodes.value, edges.value),
  });
}

async function handlePublish() {
  try {
    await handleSave();
    await publishWorkflow(props.workflow.id);
  } catch {
    // Both mutations already surface a toast on failure.
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center justify-between border-b px-4 py-2">
      <div class="min-w-0">
        <h1 class="truncate text-sm font-semibold">{{ workflow.name }}</h1>
        <p class="text-xs text-muted-foreground">
          {{ workflow.publishedDefinition ? 'Published' : 'Draft' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="isRunsListOpen = true">
          Runs
        </Button>
        <Button variant="outline" size="sm" :disabled="isSaving" @click="handleSave">
          <Spinner v-if="isSaving" class="mr-2" />
          Save
        </Button>
        <Button variant="outline" size="sm" :disabled="isPublishing" @click="handlePublish">
          <Spinner v-if="isPublishing" class="mr-2" />
          Publish
        </Button>
        <Button size="sm" @click="isRunDialogOpen = true">
          <PlayIcon class="mr-2 size-4 stroke-1.5" />
          Run
        </Button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <div class="w-56 shrink-0 overflow-y-auto border-r p-3">
        <WorkflowNodePalette @add-node="addNode" />
      </div>

      <div class="min-w-0 flex-1">
        <WorkflowCanvas
          v-model:nodes="nodes"
          v-model:edges="edges"
          @select-node="selectedNodeId = $event"
        />
      </div>

      <WorkflowNodeConfigPanel
        v-if="selectedNode"
        :key="selectedNode.id"
        :node="selectedNode"
        @delete="deleteSelectedNode"
        @close="selectedNodeId = null"
      />
    </div>

    <WorkflowRunDialog v-model:open="isRunDialogOpen" :workflow-id="workflow.id" />
    <WorkflowRunsList v-model:open="isRunsListOpen" :workflow-id="workflow.id" />
  </div>
</template>
