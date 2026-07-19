import type { Workflow, WorkflowRun, WorkflowRunWithSteps } from '@repo/database';
import {
  createWorkflow,
  createWorkflowRun,
  deleteWorkflowById,
  getAllWorkflowsByWorkspaceId,
  getRunById,
  getRunsByWorkflowId,
  getWorkflowById,
  getWorkflowCountByWorkspaceId,
  publishWorkflow,
  updateRunStatus,
  updateWorkflow,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  queue,
  removeQueueJobScheduler,
  upsertQueueJobScheduler,
  WORKFLOW_RUN_JOB,
  WORKFLOW_SCHEDULE_TICK_JOB,
  WORKFLOW_SCHEDULES_QUEUE,
  WorkflowRunJobDto,
  WorkflowScheduleTickJobDto,
} from '@repo/queue';
import { tryCatch } from '@repo/utils';
import type { WorkflowDefinition } from '@repo/workflow';
import { getScheduleFromDefinition, validateWorkflowDefinition } from '@repo/workflow';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';

/** Loads a workflow and 404s if it doesn't exist in the given workspace. */
async function loadOwnedWorkflow({
  workspaceId,
  workflowId,
}: {
  workspaceId: string;
  workflowId: string;
}): Promise<Workflow> {
  const { error, data: workflowRecord } = await tryCatch(() =>
    getWorkflowById({ workflowId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load workflow', error);
    throw new InternalServerErrorException('Failed to load workflow');
  }

  if (!workflowRecord) {
    throw new NotFoundException('Workflow not found');
  }

  return workflowRecord;
}

/** Loads a run and 404s if it doesn't exist under the given workflow. */
async function loadOwnedRun({
  workflowId,
  runId,
}: {
  workflowId: string;
  runId: string;
}): Promise<WorkflowRunWithSteps> {
  const { error, data: run } = await tryCatch(() => getRunById({ runId, workflowId }));

  if (error !== null) {
    logger.error('Failed to load workflow run', error);
    throw new InternalServerErrorException('Failed to load workflow run');
  }

  if (!run) {
    throw new NotFoundException('Workflow run not found');
  }

  return run;
}

export interface ListWorkflowsResult {
  workflows: Awaited<ReturnType<typeof getAllWorkflowsByWorkspaceId>>;
  meta: { totalCount: number };
}

/**
 * [GET] /workspace/:workspaceId/workflow
 * Lists a workspace's workflows, paginated.
 */
export async function listWorkflows({
  workspaceId,
  page,
  limit,
  sort,
}: {
  workspaceId: string;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}): Promise<ListWorkflowsResult> {
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    getWorkflowCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null) {
    logger.error('Failed to count workflows', countError);
    throw new InternalServerErrorException('Failed to list workflows');
  }

  const { error, data: workflows } = await tryCatch(() =>
    getAllWorkflowsByWorkspaceId({ workspaceId, limit, sort, offset }),
  );

  if (error !== null || !workflows) {
    logger.error('Failed to list workflows', error);
    throw new InternalServerErrorException('Failed to list workflows');
  }

  return { workflows, meta: { totalCount: totalCount ?? 0 } };
}

/**
 * [POST] /workspace/:workspaceId/workflow
 * Creates a new workflow.
 */
export async function createWorkflowForUser({
  workspaceId,
  userId,
  name,
  description,
  definition,
}: {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
}): Promise<Workflow> {
  const { error, data: workflowRecord } = await tryCatch(() =>
    createWorkflow({ userId, workspaceId, name, description, definition }),
  );

  if (error !== null || !workflowRecord) {
    logger.error('Failed to create workflow', error);
    throw new InternalServerErrorException('Failed to create workflow');
  }

  return workflowRecord;
}

/**
 * [GET] /workspace/:workspaceId/workflow/:workflowId
 */
export async function getWorkflowForWorkspace({
  workspaceId,
  workflowId,
}: {
  workspaceId: string;
  workflowId: string;
}): Promise<Workflow> {
  return loadOwnedWorkflow({ workspaceId, workflowId });
}

/**
 * [PATCH] /workspace/:workspaceId/workflow/:workflowId
 * Updates name/description/definition. Splits the old upsert endpoint's
 * update half: the client already knows whether it's creating or editing.
 */
export async function updateWorkflowForWorkspace({
  workspaceId,
  workflowId,
  name,
  description,
  definition,
}: {
  workspaceId: string;
  workflowId: string;
  name?: string;
  description?: string;
  definition?: WorkflowDefinition;
}): Promise<Workflow> {
  const { error, data: workflowRecord } = await tryCatch(() =>
    updateWorkflow({ workflowId, workspaceId, name, description, definition }),
  );

  if (error !== null) {
    logger.error('Failed to update workflow', error);
    throw new InternalServerErrorException('Failed to update workflow');
  }

  if (!workflowRecord) {
    throw new NotFoundException('Workflow not found');
  }

  return workflowRecord;
}

/**
 * [DELETE] /workspace/:workspaceId/workflow/:workflowId
 * Delete is idempotent: a non-matching id is a no-op, matching
 * document.service.ts. Also best-effort removes the workflow's BullMQ
 * scheduler; an orphaned scheduler is otherwise cleaned up by the worker's
 * tick orphan guard, so a failure here must not fail the delete.
 */
export async function deleteWorkflowForWorkspace({
  workspaceId,
  workflowId,
}: {
  workspaceId: string;
  workflowId: string;
}): Promise<void> {
  await deleteWorkflowById({ workflowId, workspaceId });

  const { error: schedulerError } = await tryCatch(() =>
    removeQueueJobScheduler({ queueName: WORKFLOW_SCHEDULES_QUEUE, schedulerId: workflowId }),
  );

  if (schedulerError !== null) {
    logger.error('Failed to remove workflow schedule after delete', schedulerError);
  }
}

export type PublishWorkflowResult =
  | { published: true; workflow: Workflow }
  | { published: false; errors: string[] };

/**
 * [POST] /workspace/:workspaceId/workflow/:workflowId/publish
 * Validates the current draft definition and, if valid, snapshots it as the
 * published definition and syncs the BullMQ schedule to match.
 *
 * Returns a `published: false` sentinel instead of throwing on an invalid
 * definition: apps/api/src/app.ts's onError only forwards `{ code, error }`
 * for thrown exceptions, and the web app needs the full `errors` list
 * (same reasoning as LINKEDIN_NOT_CONNECTED_ERROR_CODE in
 * social-post.service.ts).
 */
export async function publishWorkflowForWorkspace({
  workspaceId,
  workflowId,
}: {
  workspaceId: string;
  workflowId: string;
}): Promise<PublishWorkflowResult> {
  const workflowRecord = await loadOwnedWorkflow({ workspaceId, workflowId });

  const validation = validateWorkflowDefinition(workflowRecord.definition);

  if (!validation.valid) {
    return { published: false, errors: validation.errors };
  }

  const schedule = getScheduleFromDefinition(workflowRecord.definition);

  const { error, data: publishedWorkflow } = await tryCatch(() =>
    publishWorkflow({
      workflowId,
      workspaceId,
      scheduleCron: schedule?.cron ?? null,
      scheduleTimezone: schedule?.timezone ?? null,
    }),
  );

  if (error !== null || !publishedWorkflow) {
    logger.error('Failed to publish workflow', error);
    throw new InternalServerErrorException('Failed to publish workflow');
  }

  // The DB write above is the source of truth; this syncs the Redis
  // scheduler to match it. Queues are fail-fast (enableOfflineQueue:
  // false), so a sync failure surfaces as a 500 rather than leaving the
  // client believing publish succeeded while the schedule silently didn't
  // apply. Publish is idempotent and retryable, and worker-side
  // reconciliation heals any residual drift, so there is no DB rollback.
  const { error: schedulerError } = await tryCatch(async () => {
    if (!schedule) {
      return removeQueueJobScheduler({
        queueName: WORKFLOW_SCHEDULES_QUEUE,
        schedulerId: workflowId,
      });
    }

    return upsertQueueJobScheduler({
      queueName: WORKFLOW_SCHEDULES_QUEUE,
      schedulerId: workflowId,
      repeat: { pattern: schedule.cron, tz: schedule.timezone },
      job: {
        name: WORKFLOW_SCHEDULE_TICK_JOB,
        data: new WorkflowScheduleTickJobDto({ workflowId }).toJSON(),
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { age: 24 * 3600 } },
      },
    });
  });

  if (schedulerError !== null) {
    logger.error('Failed to sync workflow schedule after publish', schedulerError);
    throw new InternalServerErrorException('Failed to sync workflow schedule');
  }

  return { published: true, workflow: publishedWorkflow };
}

export type StartWorkflowRunResult =
  | { started: true; run: WorkflowRun }
  | { started: false; errors: string[] };

/**
 * [POST] /workspace/:workspaceId/workflow/:workflowId/run
 * Enqueues a run of the workflow's published definition. See
 * publishWorkflowForWorkspace for why an invalid definition is a sentinel
 * result rather than a thrown exception.
 */
export async function startWorkflowRun({
  workspaceId,
  workflowId,
  input,
}: {
  workspaceId: string;
  workflowId: string;
  input?: string;
}): Promise<StartWorkflowRunResult> {
  const workflowRecord = await loadOwnedWorkflow({ workspaceId, workflowId });

  if (!workflowRecord.publishedDefinition) {
    throw new BadRequestException('Workflow is not published');
  }

  const validation = validateWorkflowDefinition(workflowRecord.publishedDefinition);

  if (!validation.valid) {
    return { started: false, errors: validation.errors };
  }

  const { error, data: run } = await tryCatch(() =>
    createWorkflowRun({
      workflowId,
      definition: workflowRecord.publishedDefinition!,
      input,
    }),
  );

  if (error !== null || !run) {
    logger.error('Failed to create workflow run', error);
    throw new InternalServerErrorException('Failed to create workflow run');
  }

  const { error: enqueueError } = await tryCatch(() =>
    queue.workflow().add(WORKFLOW_RUN_JOB, new WorkflowRunJobDto({ runId: run.id }).toJSON(), {
      attempts: 3,
    }),
  );

  if (enqueueError !== null) {
    logger.error('Failed to enqueue workflow run', enqueueError);

    // Best-effort: the run row would otherwise stay 'pending' forever with
    // no job behind it (e.g. Redis is down).
    await tryCatch(() =>
      updateRunStatus({
        runId: run.id,
        status: 'failed',
        error: 'Failed to enqueue workflow run',
        finishedAt: new Date(),
      }),
    );

    throw new InternalServerErrorException('Failed to enqueue workflow run');
  }

  return { started: true, run };
}

/**
 * [GET] /workspace/:workspaceId/workflow/:workflowId/run
 * Lists every run of a workflow, latest first. Runs are naturally bounded
 * per workflow (docs/api-standards/prd.md), so this returns everything
 * rather than paginating.
 */
export async function listWorkflowRuns({
  workspaceId,
  workflowId,
}: {
  workspaceId: string;
  workflowId: string;
}): Promise<WorkflowRun[]> {
  await loadOwnedWorkflow({ workspaceId, workflowId });

  const { error, data: runs } = await tryCatch(() => getRunsByWorkflowId({ workflowId }));

  if (error !== null || !runs) {
    logger.error('Failed to list workflow runs', error);
    throw new InternalServerErrorException('Failed to list workflow runs');
  }

  return runs;
}

/**
 * [GET] /workspace/:workspaceId/workflow/:workflowId/run/:runId
 */
export async function getWorkflowRun({
  workspaceId,
  workflowId,
  runId,
}: {
  workspaceId: string;
  workflowId: string;
  runId: string;
}): Promise<WorkflowRunWithSteps> {
  await loadOwnedWorkflow({ workspaceId, workflowId });
  return loadOwnedRun({ workflowId, runId });
}

/**
 * [POST] /workspace/:workspaceId/workflow/:workflowId/run/:runId/cancel
 * Cancels a pending or running run.
 */
export async function cancelWorkflowRun({
  workspaceId,
  workflowId,
  runId,
}: {
  workspaceId: string;
  workflowId: string;
  runId: string;
}): Promise<WorkflowRunWithSteps> {
  await loadOwnedWorkflow({ workspaceId, workflowId });
  const run = await loadOwnedRun({ workflowId, runId });

  if (run.status !== 'pending' && run.status !== 'running') {
    throw new BadRequestException(`Workflow run cannot be cancelled while ${run.status}`);
  }

  const { error: cancelError } = await tryCatch(() =>
    updateRunStatus({ runId, status: 'cancelled', finishedAt: new Date() }),
  );

  if (cancelError !== null) {
    logger.error('Failed to cancel workflow run', cancelError);
    throw new InternalServerErrorException('Failed to cancel workflow run');
  }

  // Re-fetch with steps so the response shape matches getWorkflowRun.
  return loadOwnedRun({ workflowId, runId });
}
