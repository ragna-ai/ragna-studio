import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { creditGuard } from '../middlewares/creditGuard';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  cancelWorkflowRun,
  createWorkflowForUser,
  deleteWorkflowForWorkspace,
  getWorkflowForWorkspace,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflows,
  publishWorkflowForWorkspace,
  startWorkflowRun,
  updateWorkflowForWorkspace,
} from '../services/workflow.service';
import {
  validCreateWorkflowBody,
  validPaginationQuery,
  validRunWorkflowBody,
  validUpdateWorkflowBody,
  validWorkflowIdParam,
  validWorkflowRunIdParam,
} from '../validation';

export const workflowController = new Hono()
  .basePath('/workspace/:workspaceId/workflow')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/workflow
   * Lists the workspace's workflows, paginated.
   */
  .get('/', validPaginationQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const { workflows, meta } = await listWorkflows({
      workspaceId: workspace.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return c.json({ workflows, meta });
  })
  /**
   * [POST] /workspace/:workspaceId/workflow
   * Creates a new workflow.
   */
  .post('/', validCreateWorkflowBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const workflow = await createWorkflowForUser({
      workspaceId: workspace.id,
      userId: user.id,
      name: body.name,
      description: body.description,
      definition: body.definition,
    });

    return c.json({ workflow }, StatusCodes.CREATED);
  })
  /**
   * [GET] /workspace/:workspaceId/workflow/:workflowId
   */
  .get('/:workflowId', validWorkflowIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const workflow = await getWorkflowForWorkspace({
      workspaceId: workspace.id,
      workflowId: param.workflowId,
    });

    return c.json({ workflow });
  })
  /**
   * [PATCH] /workspace/:workspaceId/workflow/:workflowId
   * Updates any of name/description/definition.
   */
  .patch('/:workflowId', validWorkflowIdParam, validUpdateWorkflowBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const workflow = await updateWorkflowForWorkspace({
      workspaceId: workspace.id,
      workflowId: param.workflowId,
      name: body.name,
      description: body.description,
      definition: body.definition,
    });

    return c.json({ workflow });
  })
  /**
   * [DELETE] /workspace/:workspaceId/workflow/:workflowId
   */
  .delete('/:workflowId', validWorkflowIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteWorkflowForWorkspace({ workspaceId: workspace.id, workflowId: param.workflowId });

    return c.json({ message: 'Workflow deleted successfully' });
  })
  /**
   * [POST] /workspace/:workspaceId/workflow/:workflowId/publish
   * Validates and publishes a workflow's current definition.
   */
  .post('/:workflowId/publish', validWorkflowIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const result = await publishWorkflowForWorkspace({
      workspaceId: workspace.id,
      workflowId: param.workflowId,
    });

    if (!result.published) {
      // Bypasses the normal exception -> { code, error } envelope on
      // purpose: the web app needs the full validation `errors` list (see
      // workflow.service.ts's publishWorkflowForWorkspace doc comment).
      return c.json(
        { code: 400, error: 'Workflow definition is invalid', errors: result.errors },
        400,
      );
    }

    return c.json({ workflow: result.workflow });
  })
  /**
   * [GET] /workspace/:workspaceId/workflow/:workflowId/run
   * Lists every run of the workflow, latest first. Not paginated: see
   * listWorkflowRuns in workflow.service.ts.
   */
  .get('/:workflowId/run', validWorkflowIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const runs = await listWorkflowRuns({
      workspaceId: workspace.id,
      workflowId: param.workflowId,
    });

    return c.json({ runs });
  })
  /**
   * [POST] /workspace/:workspaceId/workflow/:workflowId/run
   * Enqueues a run of the workflow's published definition. Gated by
   * creditGuard: this is the one route in this controller that spends
   * credits, so the guard is mounted here only, not with `.use()` on the
   * whole controller (specs/credits/prd.md, "creditGuard").
   */
  .post('/:workflowId/run', creditGuard, validWorkflowIdParam, validRunWorkflowBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const result = await startWorkflowRun({
      workspaceId: workspace.id,
      workflowId: param.workflowId,
      input: body.input,
    });

    if (!result.started) {
      // Same bypass as the publish endpoint above.
      return c.json(
        { code: 400, error: 'Workflow definition is invalid', errors: result.errors },
        400,
      );
    }

    return c.json({ run: result.run });
  })
  /**
   * [GET] /workspace/:workspaceId/workflow/:workflowId/run/:runId
   * Gets a specific workflow run, including its steps.
   */
  .get('/:workflowId/run/:runId', validWorkflowRunIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const run = await getWorkflowRun({
      workspaceId: workspace.id,
      workflowId: param.workflowId,
      runId: param.runId,
    });

    return c.json({ run });
  })
  /**
   * [POST] /workspace/:workspaceId/workflow/:workflowId/run/:runId/cancel
   * Cancels a pending or running run.
   */
  .post('/:workflowId/run/:runId/cancel', validWorkflowRunIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const run = await cancelWorkflowRun({
      workspaceId: workspace.id,
      workflowId: param.workflowId,
      runId: param.runId,
    });

    return c.json({ run });
  });
