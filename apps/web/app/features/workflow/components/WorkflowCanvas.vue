<script setup lang="ts">
import type { WorkflowEdge, WorkflowNode } from '@repo/workflow';
import type { Connection, NodeMouseEvent, VueFlowStore } from '@vue-flow/core';
import { nanoid } from 'nanoid';
import { Canvas } from '~/components/ai-elements/canvas';
import { Controls } from '~/components/ai-elements/controls';
import WorkflowFlowNode from '~/features/workflow/components/WorkflowFlowNode.vue';

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

// Composables

// Computed

// Functions
// Default fitViewOnInit zooms small graphs all the way in; cap the zoom instead.
function onPaneReady(instance: VueFlowStore) {
  instance.fitView({ padding: 0.2, maxZoom: 1 });
}

function onConnect(connection: Connection) {
  edges.value.push({
    id: `edge-${nanoid(8)}`,
    source: connection.source,
    target: connection.target,
    ...(connection.sourceHandle === 'true' || connection.sourceHandle === 'false'
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
    @pane-ready="onPaneReady"
    @connect="onConnect"
    @node-click="onNodeClick"
    @pane-click="onPaneClick"
  >
    <template
      v-for="nodeType in ['trigger', 'agent', 'tool', 'condition', 'transform']"
      :key="nodeType"
      #[`node-${nodeType}`]="nodeProps"
    >
      <WorkflowFlowNode v-bind="nodeProps" />
    </template>
    <Controls position="bottom-left" />
  </Canvas>
</template>
