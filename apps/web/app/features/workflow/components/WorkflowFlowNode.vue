<script setup lang="ts">
import type { WorkflowNodeType, WorkflowStepStatus } from '@repo/workflow';
import {
  BotIcon,
  GitBranchIcon,
  ShuffleIcon,
  SparklesIcon,
  UsersIcon,
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
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import { NODE_TYPE_LABEL_KEYS, type WorkflowNodeData } from '~/features/workflow/types/node-data';
import { cn, firstToUpperCase } from '~/lib/utils';

// Imports

type Props = NodeProps<WorkflowNodeData, object, WorkflowNodeType>;

// Props
const props = defineProps<Props>();

// Composables
// Every agent node calls this; TanStack vue-query dedupes by query key, so
// this is one shared fetch (or cache hit) for the whole canvas, not one per
// node, and no prop plumbing through Vue Flow is needed.
const { data: agentsData } = useGetAllAgents();
const { t } = useI18n();

// Computed
// The referenced agent, once loaded. Only agent-type nodes with an
// `agentId` resolve to anything; renders nothing until the list is in.
const selectedAgent = computed(() => {
  if (props.type !== 'agent') return undefined;
  const config = props.data.config;
  const agentId = 'agentId' in config ? config.agentId : undefined;
  return agentsData.value?.agents.find((agent) => agent.id === agentId);
});
const typeIcon = computed(
  () =>
    ({
      trigger: ZapIcon,
      agent: BotIcon,
      tool: WrenchIcon,
      condition: GitBranchIcon,
      transform: ShuffleIcon,
      team: UsersIcon,
    })[props.type],
);

const isCondition = computed(() => props.type === 'condition');

// The team node's lead agent, once loaded. Shown instead of the agent-only
// model/tools card below, since a lead has no toolset of its own in v1.
const teamLead = computed(() => {
  if (props.type !== 'team') return undefined;
  const config = props.data.config;
  const leadAgentId = 'leadAgentId' in config ? config.leadAgentId : undefined;
  return agentsData.value?.agents.find((agent) => agent.id === leadAgentId);
});
const teamMemberCount = computed(() => {
  if (props.type !== 'team') return undefined;
  const config = props.data.config;
  return 'members' in config ? config.members.length : undefined;
});

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
    case 'team':
      return 'prompt' in config ? config.prompt : '';
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
        <span class="flex shrink-0 items-center gap-1.5">
          <span
            v-if="props.data.stepToolCallCount"
            class="flex items-center gap-0.5 text-xs font-normal text-muted-foreground"
            :title="t('workflow.node.toolCallTooltip', { count: props.data.stepToolCallCount })"
          >
            <SparklesIcon class="size-3 stroke-1.5" />
            {{ props.data.stepToolCallCount }}
          </span>
          <Badge variant="outline">{{ t(NODE_TYPE_LABEL_KEYS[props.type]) }}</Badge>
        </span>
      </NodeTitle>
    </NodeHeader>

    <NodeContent
      v-if="summary || selectedAgent || teamMemberCount !== undefined"
      class="flex flex-col gap-1.5 text-xs text-muted-foreground"
    >
      <p v-if="summary" class="truncate">{{ summary }}</p>

      <div v-if="selectedAgent" class="flex flex-col gap-1">
        <span v-if="selectedAgent.aiModel" class="truncate">
          {{ firstToUpperCase(selectedAgent.aiModel.provider) }} - {{ selectedAgent.aiModel.displayName }}
        </span>
        <span class="flex flex-wrap gap-1">
          <Badge
            v-for="tool in selectedAgent.tools"
            :key="tool"
            variant="secondary"
            class="px-1.5 py-0 text-[10px] font-normal"
          >
            {{ tool }}
          </Badge>
          <span v-if="!selectedAgent.tools?.length">{{ t('common.noTools') }}</span>
        </span>
      </div>

      <div v-if="teamMemberCount !== undefined" class="flex flex-col gap-1">
        <span class="truncate">{{
          t('workflow.node.lead', { name: teamLead?.name ?? t('workflow.node.defaultAgent') })
        }}</span>
        <span>{{ teamMemberCount }}
          {{ teamMemberCount === 1 ? t('workflow.node.memberSingular') : t('workflow.node.memberPlural') }}
        </span>
      </div>
    </NodeContent>

    <!-- Labels the handles below: "input" on the left for every node but
         the trigger (it has no target handle), "output" on the right, or
         "true"/"false" for a condition's two branch handles. -->
    <div class="flex items-center justify-between px-3 pb-2 text-xs text-muted-foreground">
      <span>{{ props.type === 'trigger' ? '' : t('workflow.node.input') }}</span>
      <span v-if="isCondition" class="flex gap-3">
        <span>true</span>
        <span>false</span>
      </span>
      <span v-else>{{ t('workflow.node.output') }}</span>
    </div>

    <template v-if="isCondition">
      <Handle type="source" :position="Position.Right" id="true" style="top: 55%" />
      <Handle type="source" :position="Position.Right" id="false" style="top: 80%" />
    </template>
    <Handle v-else type="source" :position="Position.Right" />
  </Node>
</template>
