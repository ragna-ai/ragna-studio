import type { WorkflowGraphIssue } from '@repo/workflow';

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
