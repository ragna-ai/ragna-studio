import { seedAuthenticatedUser, seedCreditAccount, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD + the run lifecycle for /workspace/:workspaceId/workflow
// (docs/testing/strategy.md, priority 3; docs/credits/prd.md for the run
// route's creditGuard). Auth/authorization are covered exhaustively in
// test/auth/ and test/workspace/workspace-authorization.test.ts; this file
// only checks the workflow feature's own behavior. Worker execution of an
// enqueued run is out of scope: these tests only check that enqueueing
// itself succeeds or fails correctly.

const EMPTY_DEFINITION = { nodes: [], edges: [] };

// Passes validateWorkflowDefinition (exactly one trigger node, no dangling
// edges), so it's the one definition shape in this file that can actually be
// published and run.
const MANUAL_TRIGGER_DEFINITION = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { label: 'Start', config: { kind: 'manual' } },
    },
  ],
  edges: [],
};

const definitionSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

const workflowSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  definition: definitionSchema,
  publishedDefinition: definitionSchema.nullable(),
  scheduleCron: z.string().nullable(),
  scheduleTimezone: z.string().nullable(),
});

// The list endpoint projects a narrower column set than the single-workflow
// endpoints (getAllWorkflowsByWorkspaceId in workflow.repo.ts): no
// workspaceId/userId, and no draft `definition`.
const workflowListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  publishedDefinition: definitionSchema.nullable(),
  scheduleCron: z.string().nullable(),
  scheduleTimezone: z.string().nullable(),
});

const workflowResponseSchema = z.object({ workflow: workflowSchema });
const workflowListResponseSchema = z.object({
  workflows: z.array(workflowListItemSchema),
  meta: z.object({ totalCount: z.number() }),
});

const publishFailureResponseSchema = z.object({
  errors: z.array(z.string()),
});

const workflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  status: z.enum(['pending', 'running', 'suspended', 'completed', 'failed', 'cancelled']),
  triggeredBy: z.enum(['manual', 'schedule']),
  input: z.string().nullable(),
  output: z.string().nullable(),
  error: z.string().nullable(),
});

const workflowRunStepSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
});

const runResponseSchema = z.object({ run: workflowRunSchema });
const runListResponseSchema = z.object({ runs: z.array(workflowRunSchema) });
const runWithStepsResponseSchema = z.object({
  run: workflowRunSchema.extend({ steps: z.array(workflowRunStepSchema) }),
});

async function createWorkflow(
  cookieHeader: string,
  workspaceId: string,
  body: Record<string, unknown> = { name: 'My workflow', definition: EMPTY_DEFINITION },
) {
  const response = await app.request(`/workspace/${workspaceId}/workflow`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    workflow: workflowResponseSchema.parse(await response.json()).workflow,
  };
}

async function publishWorkflow(
  cookieHeader: string,
  workspaceId: string,
  workflowId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await app.request(`/workspace/${workspaceId}/workflow/${workflowId}/publish`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
  });
  return { status: response.status, body: await response.json() };
}

/** Creates and publishes a workflow with a valid, runnable definition. */
async function seedPublishedWorkflow(cookieHeader: string, workspaceId: string) {
  const { workflow } = await createWorkflow(cookieHeader, workspaceId, {
    name: 'Publishable workflow',
    definition: MANUAL_TRIGGER_DEFINITION,
  });
  await publishWorkflow(cookieHeader, workspaceId, workflow.id);
  return workflow;
}

async function createRun(cookieHeader: string, workspaceId: string, workflowId: string) {
  const response = await app.request(`/workspace/${workspaceId}/workflow/${workflowId}/run`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return {
    status: response.status,
    run: runResponseSchema.parse(await response.json()).run,
  };
}

describe('GET /workspace/:workspaceId/workflow', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/workflow`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = workflowListResponseSchema.parse(await response.json());
    expect(body.workflows).toEqual([]);
    expect(body.meta.totalCount).toBe(0);
  });

  test('rejects unauthenticated requests', async () => {
    const { workspaceId } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/workflow`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('paginates, newest first by default', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    for (const name of ['First', 'Second', 'Third']) {
      await createWorkflow(cookieHeader, workspaceId, { name, definition: EMPTY_DEFINITION });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const response = await app.request(`/workspace/${workspaceId}/workflow?page=1&limit=2`, {
      headers: { cookie: cookieHeader },
    });
    const body = workflowListResponseSchema.parse(await response.json());

    expect(body.meta.totalCount).toBe(3);
    expect(body.workflows.map((workflow) => workflow.name)).toEqual(['Third', 'Second']);
  });
});

describe('POST /workspace/:workspaceId/workflow', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates a workflow and it shows up in the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const { status, workflow } = await createWorkflow(cookieHeader, workspaceId, {
      name: 'Lead intake',
      definition: EMPTY_DEFINITION,
    });

    expect(status).toBe(StatusCodes.CREATED);
    expect(workflow.name).toBe('Lead intake');
    expect(workflow.workspaceId).toBe(workspaceId);
    expect(workflow.publishedDefinition).toBeNull();

    const listResponse = await app.request(`/workspace/${workspaceId}/workflow`, {
      headers: { cookie: cookieHeader },
    });
    const body = workflowListResponseSchema.parse(await listResponse.json());
    expect(body.workflows.map((item) => item.id)).toEqual([workflow.id]);
  });

  test('rejects an empty name', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/workflow`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', definition: EMPTY_DEFINITION }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('GET /workspace/:workspaceId/workflow/:workflowId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('404s for a workflow id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId);
    await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PATCH /workspace/:workspaceId/workflow/:workflowId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('applies a partial update, leaving the draft definition untouched', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId, {
      name: 'Original',
      definition: EMPTY_DEFINITION,
    });

    const response = await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = workflowResponseSchema.parse(await response.json());
    expect(body.workflow.name).toBe('Renamed');
    expect(body.workflow.definition).toEqual(EMPTY_DEFINITION);
  });

  test('404s for a workflow id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId);
    await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New name' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId/workflow/:workflowId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('removes the workflow from the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId);

    const deleteResponse = await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/workflow`, {
      headers: { cookie: cookieHeader },
    });
    const body = workflowListResponseSchema.parse(await listResponse.json());
    expect(body.workflows).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/workflow/:workflowId/publish', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('snapshots the draft definition as published', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId, {
      name: 'Publishable',
      definition: MANUAL_TRIGGER_DEFINITION,
    });

    const { status, body } = await publishWorkflow(cookieHeader, workspaceId, workflow.id);

    expect(status).toBe(StatusCodes.OK);
    const parsed = workflowResponseSchema.parse(body);
    expect(parsed.workflow.publishedDefinition).toEqual(MANUAL_TRIGGER_DEFINITION);
  });

  test('rejects a definition with no trigger node', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId);

    const { status, body } = await publishWorkflow(cookieHeader, workspaceId, workflow.id);

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    const parsed = publishFailureResponseSchema.parse(body);
    expect(parsed.errors).toEqual(['Expected exactly one trigger node, found 0']);
  });
});

describe('GET /workspace/:workspaceId/workflow/:workflowId/run', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new workflow', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId);

    const response = await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}/run`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = runListResponseSchema.parse(await response.json());
    expect(body.runs).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/workflow/:workflowId/run', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects with 402 when the workspace has no credit account', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId);

    const response = await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}/run`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(StatusCodes.PAYMENT_REQUIRED);
  });

  test('enqueues a run once the workspace has credits', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 10_000_000n });
    const workflow = await seedPublishedWorkflow(cookieHeader, workspaceId);

    const { status, run } = await createRun(cookieHeader, workspaceId, workflow.id);

    expect(status).toBe(StatusCodes.OK);
    expect(run.workflowId).toBe(workflow.id);
    expect(run.status).toBe('pending');
    expect(run.triggeredBy).toBe('manual');
  });
});

describe('GET /workspace/:workspaceId/workflow/:workflowId/run/:runId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('404s for a run id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { workflow } = await createWorkflow(cookieHeader, workspaceId);
    // Any other real workflow id is a valid uuidv7 that's guaranteed to not
    // exist in workflow_runs, giving a genuine 404 rather than a 422 from
    // the route param's format check.
    const { workflow: otherWorkflow } = await createWorkflow(cookieHeader, workspaceId, {
      name: 'Other',
      definition: EMPTY_DEFINITION,
    });

    const response = await app.request(
      `/workspace/${workspaceId}/workflow/${workflow.id}/run/${otherWorkflow.id}`,
      { headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('gets a run including its steps', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 10_000_000n });
    const workflow = await seedPublishedWorkflow(cookieHeader, workspaceId);
    const { run } = await createRun(cookieHeader, workspaceId, workflow.id);

    const response = await app.request(
      `/workspace/${workspaceId}/workflow/${workflow.id}/run/${run.id}`,
      { headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = runWithStepsResponseSchema.parse(await response.json());
    expect(body.run.id).toBe(run.id);
    expect(body.run.steps).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/workflow/:workflowId/run/:runId/cancel', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('cancels a pending run', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 10_000_000n });
    const workflow = await seedPublishedWorkflow(cookieHeader, workspaceId);
    const { run } = await createRun(cookieHeader, workspaceId, workflow.id);

    const response = await app.request(
      `/workspace/${workspaceId}/workflow/${workflow.id}/run/${run.id}/cancel`,
      { method: 'POST', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = runWithStepsResponseSchema.parse(await response.json());
    expect(body.run.status).toBe('cancelled');
  });

  test('rejects cancelling a run that is already cancelled', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 10_000_000n });
    const workflow = await seedPublishedWorkflow(cookieHeader, workspaceId);
    const { run } = await createRun(cookieHeader, workspaceId, workflow.id);
    await app.request(`/workspace/${workspaceId}/workflow/${workflow.id}/run/${run.id}/cancel`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(
      `/workspace/${workspaceId}/workflow/${workflow.id}/run/${run.id}/cancel`,
      { method: 'POST', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
