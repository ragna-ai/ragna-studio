import { PROBLEM_CONTENT_TYPE, problemDetailsSchema } from '@repo/api-errors';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { ProblemException, toProblemDetails } from '../../src/exceptions/problem-details';
import { OrganizationDeletedException } from '../../src/exceptions';
import { getRequest } from '../document/document-fixtures';

const MISSING_FOLDER_ID = '01900000-0000-7000-8000-000000000000';

const deprecatedFieldsSchema = z.object({
  code: z.union([z.number(), z.string()]),
  error: z.string(),
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('error responses', () => {
  test('a missing resource answers with a problem document and the deprecated fields', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${workspaceId}/folder/${MISSING_FOLDER_ID}`,
      getRequest(cookieHeader),
    );
    const body = await response.json();

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    expect(response.headers.get('content-language')).toBe('en');
    const problem = problemDetailsSchema.parse(body);
    expect(problem.type).toBe('about:blank');
    expect(problem.title).toBe('Not Found');
    expect(problem.status).toBe(response.status);
    expect(problem.detail).toBeString();
    const deprecated = deprecatedFieldsSchema.parse(body);
    expect(deprecated.code).toBe(StatusCodes.NOT_FOUND);
    expect(deprecated.error).toBe(problem.detail ?? '');
  });

  test('an unauthenticated request answers with a problem document', async () => {
    const response = await app.request('/workspace');
    const body = await response.json();

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    const problem = problemDetailsSchema.parse(body);
    expect(problem.type).toBe('about:blank');
    expect(problem.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(deprecatedFieldsSchema.parse(body).code).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('toProblemDetails', () => {
  test('an unhandled error becomes a 500 without detail', () => {
    const problem = toProblemDetails(new Error('connection string postgres://secret'));

    expect(problem).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500 });
  });

  test('a typed problem exception keeps its type, extensions and message', () => {
    const problem = toProblemDetails(
      new ProblemException(StatusCodes.UNPROCESSABLE_ENTITY, {
        type: 'validation',
        message: 'Bad input',
        errors: [{ rule: 'too_small', pointer: '#/name' }],
      }),
    );

    expect(problem).toEqual({
      type: 'https://docs.ragna.io/errors/validation',
      title: 'Validation failed',
      status: 422,
      detail: 'Bad input',
      errors: [{ rule: 'too_small', pointer: '#/name' }],
    });
  });

  test('an organization deleted exception maps to its problem type', () => {
    const problem = toProblemDetails(new OrganizationDeletedException());

    expect(problem.type).toBe('https://docs.ragna.io/errors/organization-deleted');
    expect(problem.status).toBe(StatusCodes.FORBIDDEN);
  });
});
