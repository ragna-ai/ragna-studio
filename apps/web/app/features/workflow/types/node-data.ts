import type {
  AgentConfig,
  ConditionConfig,
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
  | TransformConfig;

/**
 * Vue Flow's node `data` payload for a workflow node. `stepStatus` is only
 * ever set on the read-only run view, where nodes are tinted by their run
 * step outcome; the editor never sets it.
 */
export interface WorkflowNodeData {
  label: string;
  config: WorkflowNodeConfig;
  stepStatus?: WorkflowStepStatus;
}

/**
 * A WorkflowNode with the run view's optional step-status tint mixed into
 * `data`. The API's WorkflowNode type has no such field; this is purely a
 * canvas rendering concern, so it stays out of `@repo/workflow`.
 */
export type RenderableWorkflowNode = WorkflowNode & { data: { stepStatus?: WorkflowStepStatus } };

export const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  trigger: 'Trigger',
  agent: 'Agent',
  tool: 'Tool',
  condition: 'Condition',
  transform: 'Transform',
};
