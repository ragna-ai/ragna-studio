import { PROBLEM_CONTENT_TYPE, problemDetailsSchema, problemTypeUri } from '@repo/api-errors';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
});

describe('publishing a post without a LinkedIn account', () => {
  test('answers a linkedin-not-connected problem', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await app.request(`/workspace/${workspaceId}/social-post`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Ready to publish' }),
    });
    const { post } = z.object({ post: z.object({ id: z.string() }) }).parse(await created.json());

    const response = await app.request(`/workspace/${workspaceId}/social-post/${post.id}/publish`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.type).toBe(problemTypeUri('linkedin-not-connected'));
    expect(problem.title).toBe('LinkedIn not connected');
  });
});
