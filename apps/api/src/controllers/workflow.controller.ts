import {
  createWorkflowRun,
  deleteWorkflowById,
  getAllWorkflowsByUserId,
  getRunById,
  getRunsByWorkflowId,
  getWorkflowById,
  getWorkflowCountByUserId,
  publishWorkflow,
  upsertWorkflow,
} from '@repo/database';
import { logger } from '@repo/logger';
import { WORKFLOW_RUN_JOB, WORKFLOWS_QUEUE, WorkflowRunJobDto, queueAddJob } from '@repo/queue';
import { tryCatch } from '@repo/utils';
import { validateWorkflowDefinition } from '@repo/workflow';
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

    const { error: publishError, data: publishedWorkflow } = await tryCatch(() =>
      publishWorkflow({ workflowId: param.workflowId, userId: user.id }),
    );

    if (publishError !== null) {
      logger.error('Failed to publish workflow', publishError);
      throw new InternalServerErrorException('Failed to publish workflow');
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

    await queueAddJob({
      queueName: WORKFLOWS_QUEUE,
      jobName: WORKFLOW_RUN_JOB,
      data: new WorkflowRunJobDto({ runId: run.id }).toJSON(),
    });

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
