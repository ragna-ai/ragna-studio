import { PROBLEM_CONTENT_TYPE, problemDetailsSchema, problemTypeUri } from '@repo/api-errors';
import { db, sql } from '@repo/database';
import { workflow as workflowTable } from '@repo/database/schema';
import { seedAuthenticatedUser, seedCreditAccount, truncateAllTables } from '@repo/testing';
import type { WorkflowDefinition } from '@repo/workflow';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const NO_TRIGGER_DEFINITION: WorkflowDefinition = { nodes: [], edges: [] };

beforeEach(async () => {
  await truncateAllTables();
});

async function createWorkflowWithDefinition(
  cookieHeader: string,
  workspaceId: string,
  definition: WorkflowDefinition,
): Promise<string> {
  const response = await app.request(`/workspace/${workspaceId}/workflow`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Broken workflow', definition }),
  });
  return z.object({ workflow: z.object({ id: z.string() }) }).parse(await response.json()).workflow
    .id;
}

describe('publishing an invalid workflow', () => {
  test('answers a workflow-invalid problem with one error per graph issue', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const workflowId = await createWorkflowWithDefinition(
      cookieHeader,
      workspaceId,
      NO_TRIGGER_DEFINITION,
    );

    const response = await app.request(`/workspace/${workspaceId}/workflow/${workflowId}/publish`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.type).toBe(problemTypeUri('workflow-invalid'));
    expect(problem.errors).toEqual([
      { rule: 'triggerCount', detail: 'Expected exactly one trigger node, found 0' },
    ]);
  });
});

describe('starting a run of an invalid published workflow', () => {
  test('answers a workflow-invalid problem', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 10_000_000n });
    const workflowId = await createWorkflowWithDefinition(
      cookieHeader,
      workspaceId,
      NO_TRIGGER_DEFINITION,
    );
    await db
      .update(workflowTable)
      .set({ publishedDefinition: NO_TRIGGER_DEFINITION })
      .where(sql`${workflowTable.id} = ${workflowId}`);

    const response = await app.request(`/workspace/${workspaceId}/workflow/${workflowId}/run`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.type).toBe(problemTypeUri('workflow-invalid'));
    expect(problem.errors?.[0]?.rule).toBe('triggerCount');
  });

  test('an out-of-credits caller gets an out-of-credits problem', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/workflow/any/run`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(StatusCodes.PAYMENT_REQUIRED);
    expect(problemDetailsSchema.parse(await response.json()).type).toBe(
      problemTypeUri('out-of-credits'),
    );
  });
});
