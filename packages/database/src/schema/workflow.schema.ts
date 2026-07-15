import type {
  WorkflowDefinition,
  WorkflowRunStatus,
  WorkflowRunTrigger,
  WorkflowStepStatus,
  WorkflowToolCall,
} from '@repo/workflow';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

const emptyWorkflowDefinition = { nodes: [], edges: [] };

// WORKFLOW
export const workflow = pgTable(
  'workflows',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspace.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    // Draft graph, edited on the canvas.
    definition: jsonb('definition')
      .notNull()
      .$type<WorkflowDefinition>()
      .default(emptyWorkflowDefinition),
    // Snapshot used for execution. Null until the workflow is published.
    publishedDefinition: jsonb('published_definition').$type<WorkflowDefinition>(),
    // Denormalized from the published trigger config for reconciliation
    // queries and list-view display. Null when unpublished or manual-triggered;
    // `published_definition` stays the semantic source of truth.
    scheduleCron: text('schedule_cron'),
    scheduleTimezone: text('schedule_timezone'),
    ...timestamps,
  },
  (table) => [
    index('workflow_userId_idx').on(table.userId),
    index('workflow_workspaceId_idx').on(table.workspaceId),
  ],
);

export type Workflow = typeof workflow.$inferSelect;
export type NewWorkflow = typeof workflow.$inferInsert;

// WORKFLOW RUN
export const workflowRun = pgTable(
  'workflow_runs',
  {
    id: primaryIdColumn,
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflow.id, { onDelete: 'cascade' }),
    status: text('status').notNull().$type<WorkflowRunStatus>().default('pending'),
    // Origin of the run: a manual run-endpoint call or a schedule tick.
    triggeredBy: text('triggered_by').notNull().$type<WorkflowRunTrigger>().default('manual'),
    // Snapshot of the published definition at enqueue time, so later edits
    // to the workflow don't change how a past run is displayed or replayed.
    definition: jsonb('definition').notNull().$type<WorkflowDefinition>(),
    input: text('input'),
    output: text('output'),
    error: text('error'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    ...timestamps,
  },
  (table) => [index('workflowRun_workflowId_idx').on(table.workflowId)],
);

export type WorkflowRun = typeof workflowRun.$inferSelect;
export type NewWorkflowRun = typeof workflowRun.$inferInsert;

// WORKFLOW RUN STEP
export const workflowRunStep = pgTable(
  'workflow_run_steps',
  {
    id: primaryIdColumn,
    runId: text('run_id')
      .notNull()
      .references(() => workflowRun.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    status: text('status').notNull().$type<WorkflowStepStatus>().default('pending'),
    input: text('input'),
    output: text('output'),
    // Only agent nodes running a referenced agent populate this (see
    // agent.executor.ts); every other node type leaves it null.
    toolCalls: jsonb('tool_calls').$type<WorkflowToolCall[]>(),
    error: text('error'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    ...timestamps,
  },
  (table) => [
    index('workflowRunStep_runId_idx').on(table.runId),
    uniqueIndex('workflowRunStep_runId_nodeId_idx').on(table.runId, table.nodeId),
  ],
);

export type WorkflowRunStep = typeof workflowRunStep.$inferSelect;
export type NewWorkflowRunStep = typeof workflowRunStep.$inferInsert;

export type WorkflowRunWithSteps = WorkflowRun & { steps: WorkflowRunStep[] };
export type WorkflowRunWithWorkflow = WorkflowRun & { workflow: Workflow };
