import type {
  WorkflowDefinition,
  WorkflowRunStatus,
  WorkflowRunTrigger,
  WorkflowStepStatus,
  WorkflowToolCall,
} from '@repo/workflow';

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  definition: WorkflowDefinition;
  publishedDefinition: WorkflowDefinition | null;
  // Denormalized from the published trigger config; null when unpublished or
  // manual-triggered. See @repo/workflow's getScheduleFromDefinition.
  scheduleCron: string | null;
  scheduleTimezone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowResponse {
  workflow: Workflow;
}

export interface WorkflowManyResponse {
  workflows: Workflow[];
  meta: {
    totalCount: number;
  };
}

export type UpsertWorkflowRequest = {
  id?: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
};

export interface WorkflowRunStep {
  nodeId: string;
  status: WorkflowStepStatus;
  input: string | null;
  output: string | null;
  // Only populated for agent nodes that ran a referenced agent with tools
  // (see the worker's agent executor); every other step leaves it null.
  toolCalls: WorkflowToolCall[] | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggeredBy: WorkflowRunTrigger;
  definition: WorkflowDefinition;
  input: string | null;
  output: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  steps: WorkflowRunStep[];
}

export type WorkflowRunListItem = Omit<WorkflowRun, 'definition' | 'steps'>;

export interface WorkflowRunResponse {
  run: WorkflowRun;
}

export interface WorkflowRunManyResponse {
  runs: WorkflowRunListItem[];
}

/** Body shape the API returns on a 400 from POST /workflow/:workflowId/publish. */
export interface WorkflowValidationErrorBody {
  error: string;
  errors: string[];
}
