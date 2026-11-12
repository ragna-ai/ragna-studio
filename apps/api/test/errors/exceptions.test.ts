import { PROBLEM_CONTENT_TYPE, problemDetailsSchema, problemTypeUri } from '@repo/api-errors';
import { Hono } from 'hono';
import { describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as exceptions from '../../src/exceptions';
import { ProblemException, toProblemResponse } from '../../src/exceptions/problem-details';
import { app } from '../../src/app';
import { allowedOrigins } from '../../src/utils/allowed-origins';
import { getRequest } from '../document/document-fixtures';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { myzValidator } from '../../src/utils/validator-wrapper';
import * as z from 'zod';

const ABOUT_BLANK = 'about:blank';

type ExceptionFactory = () => Error;

const exceptionFactories: Record<string, { create: ExceptionFactory; type: string }> = {
  HTTPException: { create: () => new exceptions.HTTPException(400), type: ABOUT_BLANK },
  UnauthorizedException: {
    create: () => new exceptions.UnauthorizedException(),
    type: ABOUT_BLANK,
  },
  BadRequestException: { create: () => new exceptions.BadRequestException(), type: ABOUT_BLANK },
  OutOfCreditsException: {
    create: () => new exceptions.OutOfCreditsException(),
    type: problemTypeUri('out-of-credits'),
  },
  ForbiddenException: { create: () => new exceptions.ForbiddenException(), type: ABOUT_BLANK },
  OrganizationDeletedException: {
    create: () => new exceptions.OrganizationDeletedException(),
    type: problemTypeUri('organization-deleted'),
  },
  ConflictException: { create: () => new exceptions.ConflictException(), type: ABOUT_BLANK },
  NotFoundException: { create: () => new exceptions.NotFoundException(), type: ABOUT_BLANK },
  PayloadTooLargeException: {
    create: () => new exceptions.PayloadTooLargeException(),
    type: ABOUT_BLANK,
  },
  UnsupportedMediaTypeException: {
    create: () => new exceptions.UnsupportedMediaTypeException(),
    type: ABOUT_BLANK,
  },
  UnprocessableEntityException: {
    create: () => new exceptions.UnprocessableEntityException(),
    type: ABOUT_BLANK,
  },
  InternalServerErrorException: {
    create: () => new exceptions.InternalServerErrorException(),
    type: ABOUT_BLANK,
  },
  ValidationException: {
    create: () => new exceptions.ValidationException('Bad', [{ rule: 'custom', pointer: '#/a' }]),
    type: problemTypeUri('validation'),
  },
  WorkflowInvalidException: {
    create: () => new exceptions.WorkflowInvalidException([{ code: 'cycle', message: 'Cycle' }]),
    type: problemTypeUri('workflow-invalid'),
  },
  EmailDraftExistsException: {
    create: () => new exceptions.EmailDraftExistsException({ id: 'draft-1' }),
    type: problemTypeUri('email-draft-exists'),
  },
  LinkedinNotConnectedException: {
    create: () => new exceptions.LinkedinNotConnectedException(),
    type: problemTypeUri('linkedin-not-connected'),
  },
};

function isExceptionClass(value: unknown): value is new (...args: never[]) => Error {
  return typeof value === 'function' && value.prototype instanceof Error;
}

function respondWith(thrown: () => never): Promise<Response> {
  const probe = new Hono().get('/', () => thrown());
  probe.onError((err) => toProblemResponse(err));
  return Promise.resolve(probe.request('/'));
}

describe('every exported exception', () => {
  test('has a factory in this test', () => {
    const exported = Object.entries(exceptions)
      .filter(([, value]) => isExceptionClass(value))
      .map(([name]) => name);

    expect(exported.toSorted()).toEqual(Object.keys(exceptionFactories).toSorted());
  });

  for (const [name, { create, type }] of Object.entries(exceptionFactories)) {
    test(`${name} answers a problem document of type ${type}`, async () => {
      const response = await respondWith(() => {
        throw create();
      });

      expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
      const problem = problemDetailsSchema.parse(await response.json());
      expect(problem.type).toBe(type);
      expect(problem.status).toBe(response.status);
    });
  }

  test('typed exceptions extend ProblemException', () => {
    expect(new exceptions.ValidationException('x', [])).toBeInstanceOf(ProblemException);
    expect(new exceptions.OutOfCreditsException()).toBeInstanceOf(ProblemException);
  });
});

describe('other error sources', () => {
  test('an oversize body on a limited route answers a problem 413', async () => {
    await truncateAllTables();
    const { cookieHeader } = await seedAuthenticatedUser();
    const oversizeLength = String(27 * 1024 * 1024);

    const response = await app.request('/email/send', {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        'content-type': 'application/json',
        'content-length': oversizeLength,
      },
      body: '{}',
    });

    expect(response.status).toBe(StatusCodes.REQUEST_TOO_LONG);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    expect(problemDetailsSchema.parse(await response.json()).type).toBe(ABOUT_BLANK);
  });

  test('the validator answers a validation problem', async () => {
    const probe = new Hono().post('/', myzValidator('json', z.object({ a: z.string() })), (c) =>
      c.text('ok'),
    );
    probe.onError((err) => toProblemResponse(err));

    const response = await probe.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    expect(problemDetailsSchema.parse(await response.json()).type).toBe(
      problemTypeUri('validation'),
    );
  });

  test('an unhandled error answers a problem document without detail', async () => {
    const response = await respondWith(() => {
      throw new Error('connection string postgres://secret');
    });

    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.type).toBe(ABOUT_BLANK);
    expect(problem.detail).toBeUndefined();
  });

  test('an unmatched route answers a problem 404', async () => {
    const response = await app.request('/no-such-route');

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    expect(response.headers.get('content-language')).toBe('en');
    const body = z
      .looseObject({ code: z.number(), error: z.string() })
      .and(problemDetailsSchema)
      .parse(await response.json());
    expect(body.type).toBe(ABOUT_BLANK);
    expect(body.code).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('CORS on problem responses', () => {
  const allowedOrigin = allowedOrigins[0] ?? '';

  function expectCorsProblem(response: Response) {
    expect(response.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  }

  test('a thrown exception on a real route keeps the CORS headers', async () => {
    await truncateAllTables();
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const request = getRequest(cookieHeader);

    const response = await app.request(
      `/workspace/${workspaceId}/folder/01900000-0000-7000-8000-000000000000`,
      { ...request, headers: { ...request.headers, origin: allowedOrigin } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expectCorsProblem(response);
  });

  test('an unmatched route keeps the CORS headers', async () => {
    const response = await app.request('/no-such-route', { headers: { origin: allowedOrigin } });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expectCorsProblem(response);
  });
});
