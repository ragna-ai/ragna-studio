<script setup lang="ts">
import type { WorkflowNodeType, WorkflowStepStatus } from '@repo/workflow';
import {
  BotIcon,
  GitBranchIcon,
  ShuffleIcon,
  WrenchIcon,
  ZapIcon,
} from '@lucide/vue';
import type { NodeProps } from '@vue-flow/core';
import { Handle, Position } from '@vue-flow/core';
import {
  Node,
  NodeContent,
  NodeHeader,
  NodeTitle,
} from '~/components/ai-elements/node';
import { Badge } from '~/components/ui/badge';
import { NODE_TYPE_LABELS, type WorkflowNodeData } from '~/features/workflow/types/node-data';
import { cn } from '~/lib/utils';

// Imports

type Props = NodeProps<WorkflowNodeData, object, WorkflowNodeType>;

// Props
const props = defineProps<Props>();

// Composables

// Computed
const typeIcon = computed(
  () =>
    ({
      trigger: ZapIcon,
      agent: BotIcon,
      tool: WrenchIcon,
      condition: GitBranchIcon,
      transform: ShuffleIcon,
    })[props.type],
);

const isCondition = computed(() => props.type === 'condition');

// A one-line summary shown under the label so the canvas is scannable
// without opening the config panel for every node.
const summary = computed(() => {
  const config = props.data.config;
  switch (props.type) {
    case 'agent':
      return 'prompt' in config ? config.prompt : '';
    case 'tool':
      return 'tool' in config ? config.tool : '';
    case 'condition':
      return 'operator' in config
        ? `${config.left || '…'} ${config.operator} ${config.right ?? ''}`.trim()
        : '';
    case 'transform':
      return 'template' in config ? config.template : '';
    default:
      return '';
  }
});

const statusStyles: Record<WorkflowStepStatus, string> = {
  pending: 'opacity-60',
  running: 'border-blue-500 ring-2 ring-blue-500/40 animate-pulse',
  completed: 'border-green-600 ring-1 ring-green-600/30',
  failed: 'border-destructive ring-2 ring-destructive/30',
  skipped: 'border-dashed opacity-40',
};

// Functions

// Hooks
</script>

<template>
  <Node
    :class="
      cn(
        props.data.stepStatus && statusStyles[props.data.stepStatus],
        props.selected && 'ring-2 ring-primary',
      )
    "
  >
    <Handle v-if="props.type !== 'trigger'" type="target" :position="Position.Left" />

    <NodeHeader>
      <NodeTitle class="flex items-center justify-between gap-2 text-sm">
        <span class="flex min-w-0 items-center gap-2">
          <component :is="typeIcon" class="size-4 shrink-0 stroke-1.5 text-primary" />
          <span class="truncate">{{ props.data.label }}</span>
        </span>
        <Badge variant="outline">{{ NODE_TYPE_LABELS[props.type] }}</Badge>
      </NodeTitle>
    </NodeHeader>

    <NodeContent v-if="summary" class="truncate text-xs text-muted-foreground">
      {{ summary }}
    </NodeContent>

    <template v-if="isCondition">
      <div class="flex justify-between px-3 pb-2 text-xs text-muted-foreground">
        <span>true</span>
        <span>false</span>
      </div>
      <Handle type="source" :position="Position.Right" id="true" style="top: 55%" />
      <Handle type="source" :position="Position.Right" id="false" style="top: 80%" />
    </template>
    <Handle v-else type="source" :position="Position.Right" />
  </Node>
</template>
