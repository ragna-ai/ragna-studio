import {
  createWorkflowRun,
  deleteWorkflowById,
  getAllWorkflowsByUserId,
  getRunById,
  getRunsByWorkflowId,
  getWorkflowById,
  getWorkflowCountByUserId,
  publishWorkflow,
  updateRunStatus,
  upsertWorkflow,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  WORKFLOW_RUN_JOB,
  WORKFLOW_SCHEDULE_TICK_JOB,
  WORKFLOW_SCHEDULES_QUEUE,
  WORKFLOWS_QUEUE,
  WorkflowRunJobDto,
  WorkflowScheduleTickJobDto,
  queueAddJob,
  removeQueueJobScheduler,
  upsertQueueJobScheduler,
} from '@repo/queue';
import { tryCatch } from '@repo/utils';
import { getScheduleFromDefinition, validateWorkflowDefinition } from '@repo/workflow';
import { Hono } from 'hono';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validPaginationQuery,
  validRunIdParam,
  validRunWorkflowBody,
  validUpsertWorkflowBody,
  validWorkflowIdParam,
} from '../middlewares/validationMiddlewares';

export const workflowController = new Hono()
  .basePath('/workflow')
  .use(authMiddleware)
  /**
   * [GET] /workflow
   * Get all workflows for the authenticated user
   */
  .get('/', validPaginationQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const sort = query.sort || 'desc';

    // Calculate offset for pagination ((page number - 1) * page size)
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Get all workflow count and fail gracefully
    const { data: workflowsCount } = await tryCatch(() =>
      getWorkflowCountByUserId({ userId: user.id }),
    );

    const { error, data: allUserWorkflows } = await tryCatch(() =>
      getAllWorkflowsByUserId({ userId: user.id, limit, sort, offset }),
    );

    if (error !== null) {
      logger.error('Failed to get workflows for user', error);
      throw new InternalServerErrorException('Failed to get workflows for user');
    }

    const meta = {
      totalCount: workflowsCount || 0,
    };

    return c.json({ workflows: allUserWorkflows, meta });
  })
  /**
   * [POST] /workflow
   * Create or update a workflow
   */
  .post('/', validUpsertWorkflowBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const { error, data: upsertedWorkflow } = await tryCatch(() =>
      upsertWorkflow({
        id: body.id ?? undefined,
        userId: user.id,
        name: body.name,
        description: body.description,
        definition: body.definition,
      }),
    );

    if (error !== null) {
      logger.error('Failed to upsert workflow', error);
      throw new InternalServerErrorException('Failed to upsert workflow');
    }

    return c.json({ workflow: upsertedWorkflow });
  })
  /**
   * [GET] /workflow/run/:runId
   * Get a specific workflow run by ID, including its steps
   */
  .get('/run/:runId', validRunIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: run } = await tryCatch(() =>
      getRunById({ runId: param.runId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get workflow run by ID', error);
      throw new InternalServerErrorException('Failed to get workflow run by ID');
    }

    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }

    return c.json({ run });
  })
  /**
   * [POST] /workflow/run/:runId/cancel
   * Cancel a pending or running workflow run
   */
  .post('/run/:runId/cancel', validRunIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: run } = await tryCatch(() =>
      getRunById({ runId: param.runId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get workflow run by ID', error);
      throw new InternalServerErrorException('Failed to get workflow run by ID');
    }

    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }

    if (run.status !== 'pending' && run.status !== 'running') {
      throw new BadRequestException(`Workflow run cannot be cancelled while ${run.status}`);
    }

    const { error: cancelError } = await tryCatch(() =>
      updateRunStatus({ runId: param.runId, status: 'cancelled', finishedAt: new Date() }),
    );

    if (cancelError !== null) {
      logger.error('Failed to cancel workflow run', cancelError);
      throw new InternalServerErrorException('Failed to cancel workflow run');
    }

    // Re-fetch with steps so the response shape matches GET /workflow/run/:runId.
    const { error: reloadError, data: cancelledRun } = await tryCatch(() =>
      getRunById({ runId: param.runId, userId: user.id }),
    );

    if (reloadError !== null) {
      logger.error('Failed to reload cancelled workflow run', reloadError);
      throw new InternalServerErrorException('Failed to reload cancelled workflow run');
    }

    return c.json({ run: cancelledRun });
  })
  /**
   * [GET] /workflow/:workflowId
   * Get a specific workflow by ID
   */
  .get('/:workflowId', validWorkflowIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: workflow } = await tryCatch(() =>
      getWorkflowById({ workflowId: param.workflowId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get workflow by ID', error);
      throw new InternalServerErrorException('Failed to get workflow by ID');
    }

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return c.json({ workflow });
  })
  /**
   * [DELETE] /workflow/:workflowId
   * Delete a specific workflow by ID
   */
  .delete('/:workflowId', validWorkflowIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteWorkflowById({ workflowId: param.workflowId, userId: user.id });

    // Best-effort: an orphaned scheduler is otherwise cleaned up by the
    // worker's tick orphan guard, so a failure here must not fail the delete.
    const { error: schedulerError } = await tryCatch(() =>
      removeQueueJobScheduler({
        queueName: WORKFLOW_SCHEDULES_QUEUE,
        schedulerId: param.workflowId,
      }),
    );

    if (schedulerError !== null) {
      logger.error('Failed to remove workflow schedule after delete', schedulerError);
    }

    return c.json({ message: 'Workflow deleted successfully' });
  })
  /**
   * [POST] /workflow/:workflowId/publish
   * Validate and publish a workflow's current definition
   */
  .post('/:workflowId/publish', validWorkflowIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: workflow } = await tryCatch(() =>
      getWorkflowById({ workflowId: param.workflowId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get workflow by ID', error);
      throw new InternalServerErrorException('Failed to get workflow by ID');
    }

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const validation = validateWorkflowDefinition(workflow.definition);

    if (!validation.valid) {
      return c.json(
        { code: 400, error: 'Workflow definition is invalid', errors: validation.errors },
        400,
      );
    }

    const schedule = getScheduleFromDefinition(workflow.definition);

    const { error: publishError, data: publishedWorkflow } = await tryCatch(() =>
      publishWorkflow({
        workflowId: param.workflowId,
        userId: user.id,
        scheduleCron: schedule?.cron ?? null,
        scheduleTimezone: schedule?.timezone ?? null,
      }),
    );

    if (publishError !== null) {
      logger.error('Failed to publish workflow', publishError);
      throw new InternalServerErrorException('Failed to publish workflow');
    }

    // The DB write above is the source of truth; this syncs the Redis
    // scheduler to match it. Queues are fail-fast (enableOfflineQueue:
    // false), so a sync failure surfaces as a 500 rather than leaving the
    // client believing publish succeeded while the schedule silently didn't
    // apply. Publish is idempotent and retryable, and worker-side
    // reconciliation heals any residual drift, so there is no DB rollback.
    const { error: schedulerError } = await tryCatch(() =>
      schedule
        ? upsertQueueJobScheduler({
            queueName: WORKFLOW_SCHEDULES_QUEUE,
            schedulerId: param.workflowId,
            repeat: { pattern: schedule.cron, tz: schedule.timezone },
            job: {
              name: WORKFLOW_SCHEDULE_TICK_JOB,
              data: new WorkflowScheduleTickJobDto({ workflowId: param.workflowId }).toJSON(),
              opts: { attempts: 1, removeOnComplete: true, removeOnFail: { age: 24 * 3600 } },
            },
          })
        : removeQueueJobScheduler({
            queueName: WORKFLOW_SCHEDULES_QUEUE,
            schedulerId: param.workflowId,
          }),
    );

    if (schedulerError !== null) {
      logger.error('Failed to sync workflow schedule after publish', schedulerError);
      throw new InternalServerErrorException('Failed to sync workflow schedule');
    }

    return c.json({ workflow: publishedWorkflow });
  })
  /**
   * [POST] /workflow/:workflowId/run
   * Enqueue a run of a workflow's published definition
   */
  .post('/:workflowId/run', validWorkflowIdParam, validRunWorkflowBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const { error, data: workflow } = await tryCatch(() =>
      getWorkflowById({ workflowId: param.workflowId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get workflow by ID', error);
      throw new InternalServerErrorException('Failed to get workflow by ID');
    }

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (!workflow.publishedDefinition) {
      throw new BadRequestException('Workflow is not published');
    }

    const validation = validateWorkflowDefinition(workflow.publishedDefinition);

    if (!validation.valid) {
      return c.json(
        { code: 400, error: 'Workflow definition is invalid', errors: validation.errors },
        400,
      );
    }

    const { error: createRunError, data: run } = await tryCatch(() =>
      createWorkflowRun({
        workflowId: param.workflowId,
        definition: workflow.publishedDefinition!,
        input: body.input,
      }),
    );

    if (createRunError !== null) {
      logger.error('Failed to create workflow run', createRunError);
      throw new InternalServerErrorException('Failed to create workflow run');
    }

    const { error: enqueueError } = await tryCatch(() =>
      queueAddJob({
        queueName: WORKFLOWS_QUEUE,
        jobName: WORKFLOW_RUN_JOB,
        data: new WorkflowRunJobDto({ runId: run.id }).toJSON(),
        opts: { attempts: 3 },
      }),
    );

    if (enqueueError !== null) {
      logger.error('Failed to enqueue workflow run', enqueueError);

      // Best-effort: the run row would otherwise stay 'pending' forever
      // with no job behind it (e.g. Redis is down).
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

    return c.json({ run });
  })
  /**
   * [GET] /workflow/:workflowId/runs
   * Get all runs for a specific workflow, latest first
   */
  .get('/:workflowId/runs', validWorkflowIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: runs } = await tryCatch(() =>
      getRunsByWorkflowId({ workflowId: param.workflowId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get workflow runs', error);
      throw new InternalServerErrorException('Failed to get workflow runs');
    }

    return c.json({ runs });
  });
