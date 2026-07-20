import type {
  AgentConfig,
  ConditionConfig,
  TeamConfig,
  ToolConfig,
  TransformConfig,
  TriggerConfig,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowStepStatus,
} from '@repo/workflow';

export type WorkflowNodeConfig =
  | TriggerConfig
  | AgentConfig
  | ToolConfig
  | ConditionConfig
  | TransformConfig
  | TeamConfig;

/**
 * Vue Flow's node `data` payload for a workflow node. `stepStatus` and
 * `stepToolCallCount` are only ever set on the read-only run view, where
 * nodes are tinted by their run step outcome and show how many tool calls
 * that step made; the editor never sets either.
 */
export interface WorkflowNodeData {
  label: string;
  config: WorkflowNodeConfig;
  stepStatus?: WorkflowStepStatus;
  stepToolCallCount?: number;
}

/**
 * A WorkflowNode with the run view's optional step-status tint (and tool
 * call count) mixed into `data`. The API's WorkflowNode type has no such
 * field; this is purely a canvas rendering concern, so it stays out of
 * `@repo/workflow`.
 */
export type RenderableWorkflowNode = WorkflowNode & {
  data: { stepStatus?: WorkflowStepStatus; stepToolCallCount?: number };
};

export const NODE_TYPE_LABEL_KEYS: Record<WorkflowNodeType, string> = {
  trigger: 'workflow.nodeType.trigger',
  agent: 'workflow.nodeType.agent',
  tool: 'workflow.nodeType.tool',
  condition: 'workflow.nodeType.condition',
  transform: 'workflow.nodeType.transform',
  team: 'workflow.nodeType.team',
};
