import { db } from '@repo/database';
import { seedAuthenticatedUser, seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';

// workspaceGuard tests.
// GET /workspace/:workspaceId/folder is
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

  test('allows a non-owner member of the workspace organization', async () => {
    const owner = await seedAuthenticatedUser();
    const ownerMembership = await db.query.organizationMember.findFirst({
      where: { userId: owner.userId },
    });
    const colleague = await seedOrganizationMember({
      organizationId: ownerMembership?.organizationId ?? '',
      role: 'member',
    });

    const response = await app.request(`/workspace/${owner.workspaceId}/folder`, {
      headers: { cookie: colleague.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
  });
});
