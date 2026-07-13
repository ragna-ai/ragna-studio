import type { WorkflowDefinition, WorkflowRunStatus, WorkflowStepStatus } from '@repo/workflow';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/create-id';
import { timestamps } from './common.schema';
import { user } from './user.schema';

const emptyWorkflowDefinition = sql`'{"nodes":[],"edges":[]}'`;

// WORKFLOW
export const workflow = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // Draft graph, edited on the canvas.
    definition: text('definition', { mode: 'json' })
      .notNull()
      .$type<WorkflowDefinition>()
      .default(emptyWorkflowDefinition),
    // Snapshot used for execution. Null until the workflow is published.
    publishedDefinition: text('published_definition', { mode: 'json' }).$type<WorkflowDefinition>(),
    ...timestamps,
  },
  (table) => [index('workflow_userId_idx').on(table.userId)],
);

export type Workflow = typeof workflow.$inferSelect;
export type NewWorkflow = typeof workflow.$inferInsert;

// WORKFLOW RUN
export const workflowRun = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflow.id, { onDelete: 'cascade' }),
    status: text('status').notNull().$type<WorkflowRunStatus>().default('pending'),
    // Snapshot of the published definition at enqueue time, so later edits
    // to the workflow don't change how a past run is displayed or replayed.
    definition: text('definition', { mode: 'json' }).notNull().$type<WorkflowDefinition>(),
    input: text('input'),
    output: text('output'),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (table) => [index('workflowRun_workflowId_idx').on(table.workflowId)],
);

export type WorkflowRun = typeof workflowRun.$inferSelect;
export type NewWorkflowRun = typeof workflowRun.$inferInsert;

// WORKFLOW RUN STEP
export const workflowRunStep = sqliteTable(
  'workflow_run_steps',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    runId: text('run_id')
      .notNull()
      .references(() => workflowRun.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    status: text('status').notNull().$type<WorkflowStepStatus>().default('pending'),
    input: text('input'),
    output: text('output'),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
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
