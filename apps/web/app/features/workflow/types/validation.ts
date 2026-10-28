import type { WorkflowGraphIssue } from '@repo/workflow';
import type { ComputedRef, InjectionKey } from 'vue';

export interface WorkflowFieldIssue {
  /** Dot path inside the node config, e.g. `members.1.agentId`. Empty for the node as a whole. */
  field: string;
  messageKey: string;
}

export interface WorkflowDraftValidation {
  nodeIssues: Map<string, WorkflowFieldIssue[]>;
  definitionIssues: WorkflowFieldIssue[];
  graphIssues: WorkflowGraphIssue[];
  canSave: boolean;
  canPublish: boolean;
}

export interface WorkflowBlockingMessage {
  messageKey: string;
  count: number;
}

export const WORKFLOW_VALIDATION_KEY: InjectionKey<
  ComputedRef<WorkflowDraftValidation>
> = Symbol('workflowDraftValidation');
