import { PROBLEM_CONTENT_TYPE, problemDetailsSchema, problemTypeUri } from '@repo/api-errors';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { organizationRequest } from './member-fixtures';

const deprecatedFieldsSchema = z.object({
  code: z.literal('ORGANIZATION_DELETED'),
  error: z.string(),
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('requests while the organization is deleted', () => {
  test('answer an organization-deleted problem that keeps the deprecated code', async () => {
    const owner = await seedAuthenticatedUser();
    await organizationRequest(owner.cookieHeader, 'DELETE', '');

    const response = await app.request('/workspace', { headers: { cookie: owner.cookieHeader } });

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    const body = await response.json();
    const problem = problemDetailsSchema.parse(body);
    expect(problem.type).toBe(problemTypeUri('organization-deleted'));
    expect(problem.title).toBe('Organization scheduled for deletion');
    expect(deprecatedFieldsSchema.parse(body).error).toBe(problem.detail ?? '');
  });
});
