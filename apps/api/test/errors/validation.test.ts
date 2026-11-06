import { problemDetailsSchema, problemTypeUri, validationRuleSchema } from '@repo/api-errors';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { toProblemDetails } from '../../src/exceptions/problem-details';
import { myzValidator } from '../../src/utils/validator-wrapper';

beforeEach(async () => {
  await truncateAllTables();
});

describe('request validation errors', () => {
  test('a missing field answers a validation problem with a pointer to the field', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/workflow`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.type).toBe(problemTypeUri('validation'));
    expect(problem.detail).toBeString();
    expect(problem.errors).toContainEqual({
      rule: 'invalid_type',
      pointer: '#/name',
      detail: expect.any(String),
    });
  });

  test('every error entry carries a known rule and a JSON Pointer', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/workflow`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 42, definition: 'x' }),
    });

    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.errors?.length).toBeGreaterThan(1);
    for (const entry of problem.errors ?? []) {
      expect(validationRuleSchema.safeParse(entry.rule).success).toBe(true);
      expect(entry.pointer).toStartWith('#/');
    }
  });
});

describe('validator pointers', () => {
  const schema = z.object({
    'a/b': z.string(),
    'c~d': z.string(),
    list: z.array(z.object({ id: z.string() })),
  });
  const probe = new Hono()
    .post('/', myzValidator('json', schema), (c) => c.json({ ok: true }))
    .onError((err, c) => c.json(toProblemDetails(err)));

  test('escapes slashes and tildes and indexes array items', async () => {
    const response = await probe.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list: [{}] }),
    });

    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.errors?.map((entry) => entry.pointer)).toEqual([
      '#/a~1b',
      '#/c~0d',
      '#/list/0/id',
    ]);
  });
});
