<script setup lang="ts">
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from '@repo/workflow';
import type {
  Connection,
  NodeMouseEvent,
  NodeProps,
  VueFlowStore,
} from '@vue-flow/core';
import { NODE_TYPES } from '@repo/workflow';
import { ConnectionMode } from '@vue-flow/core';
import { nanoid } from 'nanoid';
import { toast } from 'vue-sonner';
import { Canvas } from '~/components/ai-elements/canvas';
import { Controls } from '~/components/ai-elements/controls';
import WorkflowFlowNode from '~/features/workflow/components/WorkflowFlowNode.vue';
import type { WorkflowNodeData } from '~/features/workflow/types/node-data';

// Imports

interface Props {
  /** Disables dragging, connecting, and deleting; used by the run view. */
  readonly?: boolean;
}

// Props
withDefaults(defineProps<Props>(), {
  readonly: false,
});

// Emits
const emit = defineEmits<{
  (e: 'select-node', nodeId: string | null): void;
}>();

// Refs
const nodes = defineModel<WorkflowNode[]>('nodes', { required: true });
const edges = defineModel<WorkflowEdge[]>('edges', { required: true });
// Set by isValidConnection when the connection being dragged would close a
// cycle, so the connectEnd handler knows to toast. Vue Flow re-validates on
// every handle hovered during a drag, so this always reflects the last one.
const isDraggingCycleConnection = ref(false);

// Composables

// Computed

// Clicking a node opens a side panel on the right (w-80 in the editor,
// w-96 in the run view), which shrinks the canvas by that much. Shifting
// the initial view left by half a panel width keeps the graph centered in
// the space that remains once the panel is open.
const SIDE_PANEL_WIDTH = 320;

// Functions
// Default fitViewOnInit zooms small graphs all the way in; cap the zoom instead.
async function onPaneReady(instance: VueFlowStore) {
  await instance.fitView({ padding: 0.2, maxZoom: 0.9 });
  const { x, y, zoom } = instance.getViewport();
  instance.setViewport({ x: x - SIDE_PANEL_WIDTH / 2, y, zoom });
}

// True if `targetId` can already reach `sourceId` by following existing
// edges forward, i.e. connecting sourceId -> targetId would close a cycle.
function canReach(sourceId: string, targetId: string): boolean {
  const visited = new Set<string>([targetId]);
  const toVisit = [targetId];

  while (toVisit.length > 0) {
    const currentId = toVisit.pop();
    if (currentId === undefined) {
      break;
    }
    for (const edge of edges.value) {
      if (edge.source !== currentId || visited.has(edge.target)) {
        continue;
      }
      if (edge.target === sourceId) {
        return true;
      }
      visited.add(edge.target);
      toVisit.push(edge.target);
    }
  }

  return false;
}

// Strict connection mode (set on the Canvas below) already restricts
// dragging to output -> input; this closes the two gaps it leaves open, a
// node connecting back to itself and a connection that would close a cycle.
function isValidConnection(connection: Connection): boolean {
  const isSelfConnection = connection.source === connection.target;
  const closesCycle =
    !isSelfConnection && canReach(connection.source, connection.target);
  isDraggingCycleConnection.value = closesCycle;
  return !isSelfConnection && !closesCycle;
}

// isValidConnection fires repeatedly while the user hovers different handles
// during a drag, so toasting there would spam. connectEnd fires once, when
// the drag actually finishes, so that's where the toast belongs.
function onConnectEnd() {
  if (!isDraggingCycleConnection.value) {
    return;
  }
  isDraggingCycleConnection.value = false;
  toast.error('This connection would create a loop');
}

function onConnect(connection: Connection) {
  edges.value.push({
    id: `edge-${nanoid(8)}`,
    source: connection.source,
    target: connection.target,
    ...(connection.sourceHandle === 'true' ||
    connection.sourceHandle === 'false'
      ? { sourceHandle: connection.sourceHandle }
      : {}),
  });
}

function onNodeClick({ node }: NodeMouseEvent) {
  emit('select-node', node.id);
}

function onPaneClick() {
  emit('select-node', null);
}

// Vue Flow's `node-${type}` slots aren't parameterized per node type, so it
// types every slot's props with the generic `NodeProps` (whose `type` field
// is plain `string`). The `nodes` model only ever holds WorkflowNode data
// (see the `nodes` defineModel above and WorkflowFlowNode's own props), so
// this narrows the slot props back to that shape at the one place they reach
// a typed child component.
function toWorkflowNodeProps(
  nodeProps: NodeProps,
): NodeProps<WorkflowNodeData, object, WorkflowNodeType> {
  return nodeProps as NodeProps<WorkflowNodeData, object, WorkflowNodeType>;
}

// Hooks
</script>

<template>
  <Canvas
    v-model:nodes="nodes"
    v-model:edges="edges"
    class="size-full"
    :nodes-draggable="!readonly"
    :nodes-connectable="!readonly"
    :edges-updatable="!readonly"
    :elements-selectable="!readonly"
    :delete-key-code="readonly ? null : ['Backspace', 'Delete']"
    :fit-view-on-init="false"
    :connection-mode="ConnectionMode.Strict"
    :is-valid-connection="isValidConnection"
    @pane-ready="onPaneReady"
    @connect="onConnect"
    @connect-end="onConnectEnd"
    @node-click="onNodeClick"
    @pane-click="onPaneClick"
  >
    <template
      v-for="nodeType in NODE_TYPES"
      :key="nodeType"
      #[`node-${nodeType}`]="nodeProps"
    >
      <WorkflowFlowNode v-bind="toWorkflowNodeProps(nodeProps)" />
    </template>
    <Controls position="bottom-left" />
  </Canvas>
</template>
