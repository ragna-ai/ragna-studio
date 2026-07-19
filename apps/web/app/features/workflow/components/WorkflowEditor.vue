<script setup lang="ts">
import { PlayIcon, SettingsIcon } from '@lucide/vue';
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from '@repo/workflow';
import { isExecutionEquivalent } from '@repo/workflow';
import WorkflowCanvas from '~/features/workflow/components/WorkflowCanvas.vue';
import WorkflowNodeConfigPanel from '~/features/workflow/components/WorkflowNodeConfigPanel.vue';
import WorkflowNodePalette from '~/features/workflow/components/WorkflowNodePalette.vue';
import WorkflowRecentRuns from '~/features/workflow/components/WorkflowRecentRuns.vue';
import WorkflowRunDialog from '~/features/workflow/components/WorkflowRunDialog.vue';
import WorkflowRunsList from '~/features/workflow/components/WorkflowRunsList.vue';
import {
  usePublishWorkflow,
  useUpdateWorkflow,
} from '~/features/workflow/composables/useWorkflowApi';
import {
  createWorkflowNode,
  nextFreePosition,
} from '~/features/workflow/lib/default-node';
import { toWorkflowDefinition } from '~/features/workflow/lib/serialize-definition';
import type { Workflow } from '~/features/workflow/types';

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
const name = ref(props.workflow.name);
const description = ref(props.workflow.description ?? '');
const selectedNodeId = ref<string | null>(null);
const isRunDialogOpen = ref(false);
const isRunsListOpen = ref(false);
const isSettingsOpen = ref(false);

// The settings aside and the node config panel share the right-hand slot;
// selecting a node replaces the settings panel.
watch(selectedNodeId, (nodeId) => {
  if (nodeId) {
    isSettingsOpen.value = false;
  }
});

// Composables
const { mutateAsync: saveWorkflow, isPending: isSaving } = useUpdateWorkflow();
const { mutateAsync: publishWorkflow, isPending: isPublishing } = usePublishWorkflow();

// Computed
const selectedNode = computed(
  () => nodes.value.find((node) => node.id === selectedNodeId.value) ?? null,
);
// The live canvas, serialized the same way Save/Publish send it, so it can
// be compared against what was last published.
const draftDefinition = computed(() =>
  toWorkflowDefinition(nodes.value, edges.value),
);
const hasUnpublishedChanges = computed(
  () =>
    !isExecutionEquivalent(draftDefinition.value, props.workflow.publishedDefinition),
);

// Functions
function addNode(type: WorkflowNodeType) {
  const node = createWorkflowNode(type, nextFreePosition(nodes.value));
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

function toggleSettings() {
  isSettingsOpen.value = !isSettingsOpen.value;
  if (isSettingsOpen.value) {
    selectedNodeId.value = null;
  }
}

async function handleSaveSettings(value: { name: string; description: string }) {
  name.value = value.name;
  description.value = value.description;
  await handleSave();
}

async function handleSave() {
  await saveWorkflow({
    workflowId: props.workflow.id,
    name: name.value,
    description: description.value || undefined,
    definition: draftDefinition.value,
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
        <PageBreadcrumb :items="[{ label: $t('workflow.list.title'), to: '/workflow' }]">
          <template #current>
            <InlineNameField v-model:name="name" label="Workflow name" @save="handleSave" />
          </template>
        </PageBreadcrumb>
        <p class="text-xs text-muted-foreground">
          {{ workflow.publishedDefinition ? 'Published' : 'Draft' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Badge
          v-if="hasUnpublishedChanges"
          variant="outline"
          class="border-amber-500 text-amber-600"
        >
          Unpublished changes
        </Badge>
        <Button
          variant="outline"
          size="sm"
          aria-label="Workflow settings"
          @click="toggleSettings"
        >
          <SettingsIcon class="size-4 stroke-1.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="isSaving"
          @click="handleSave"
        >
          <Spinner v-if="isSaving" class="mr-2" />
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="isPublishing"
          @click="handlePublish"
        >
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
      <div
        class="flex w-56 shrink-0 flex-col justify-between gap-3 overflow-y-auto border-r p-3"
      >
        <WorkflowNodePalette @add-node="addNode" />
        <div class="flex flex-col gap-3">
          <Separator />
          <WorkflowRecentRuns
            :workflow-id="workflow.id"
            @show-all-runs="isRunsListOpen = true"
          />
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <WorkflowCanvas
          v-model:nodes="nodes"
          v-model:edges="edges"
          @select-node="selectedNodeId = $event"
        />
      </div>

      <SettingsAside
        v-if="isSettingsOpen"
        :name="name"
        :description="description"
        title="Workflow settings"
        @save="handleSaveSettings"
        @close="isSettingsOpen = false"
      />
      <WorkflowNodeConfigPanel
        v-else-if="selectedNode"
        :key="selectedNode.id"
        :node="selectedNode"
        @delete="deleteSelectedNode"
        @close="selectedNodeId = null"
      />
    </div>

    <WorkflowRunDialog
      v-model:open="isRunDialogOpen"
      :workflow="workflow"
      :draft-definition="draftDefinition"
    />
    <WorkflowRunsList v-model:open="isRunsListOpen" :workflow-id="workflow.id" />
  </div>
</template>
