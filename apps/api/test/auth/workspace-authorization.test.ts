import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';

// workspaceGuard tests (docs/testing/strategy.md, priority 2: "Authorization
// across workspace-scoped resources"). GET /workspace/:workspaceId/folder is
// the vehicle: it mounts authMiddleware + workspaceGuard with no extra
// per-route validation, so a pass/fail here isolates the guard itself.

describe('workspaceGuard', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const { workspaceId } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/folder`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('allows the owner to access their own workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/folder`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
  });

  test("rejects a request for another user's workspace as not found", async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${userB.workspaceId}/folder`, {
      headers: { cookie: userA.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('rejects a syntactically invalid workspace id as not found', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    // A v4 UUID fails the route's uuidv7 check (wrong version nibble), so
    // this never reaches the ownership lookup.
    const notAUuidV7 = crypto.randomUUID();

    const response = await app.request(`/workspace/${notAUuidV7}/folder`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
