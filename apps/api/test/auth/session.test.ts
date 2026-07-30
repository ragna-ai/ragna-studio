import {
  deleteSeededUser,
  expireSession,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// authMiddleware tests (docs/testing/strategy.md, "Auth"). GET /workspace is
// the vehicle: authMiddleware only, no workspaceGuard, so a pass/fail here
// isolates session handling from workspace authorization
// (test/workspace/workspace-authorization.test.ts covers that layer, grouped
// with the rest of the workspace domain rather than here).

const workspaceListResponseSchema = z.object({
  workspaces: z.array(
    z.object({
      id: z.string(),
      ownerId: z.string(),
      name: z.string(),
    }),
  ),
});

describe('authMiddleware', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/workspace');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('rejects a cookie whose session token does not verify', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const cookieName = cookieHeader.split('=')[0];
    const tamperedCookieHeader = `${cookieName}=this-token-was-never-issued`;

    const response = await app.request('/workspace', {
      headers: { cookie: tamperedCookieHeader },
    });

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('rejects a session that has expired', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await expireSession({ userId });

    const response = await app.request('/workspace', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('rejects a cookie once the underlying user has been deleted', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await deleteSeededUser({ userId });

    const response = await app.request('/workspace', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('accepts a valid session cookie and scopes the response to that user', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();

    const response = await app.request('/workspace', {
      headers: { cookie: userA.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);

    const body = workspaceListResponseSchema.parse(await response.json());
    expect(body.workspaces.map((workspace) => workspace.id)).toEqual([userA.workspaceId]);
    expect(body.workspaces.some((workspace) => workspace.id === userB.workspaceId)).toBe(false);
  });
});
