import { db } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { activeOrganizationId, insertInvitation } from './invitation-fixtures';

beforeEach(async () => {
  await truncateAllTables();
});

const INVITEE_EMAIL = 'invitee@example.com';

async function seedOwner() {
  const owner = await seedAuthenticatedUser();
  const organizationId = await activeOrganizationId(owner.cookieHeader);
  return { ...owner, organizationId };
}

describe('sign-up with a pending invitation', () => {
  test('joins the inviting organization with the invited role', async () => {
    const owner = await seedOwner();
    const invitationId = await insertInvitation({
      organizationId: owner.organizationId,
      inviterId: owner.userId,
      email: INVITEE_EMAIL,
      role: 'admin',
    });

    const invitee = await seedAuthenticatedUser({ email: 'Invitee@Example.com' });

    const memberships = await db.query.organizationMember.findMany({
      where: { userId: invitee.userId },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ organizationId: owner.organizationId, role: 'admin' });
    expect(await db.query.organization.findMany()).toHaveLength(1);
    // owner personal, shared, and the invitee's personal workspace
    expect(await db.query.workspace.findMany()).toHaveLength(3);
    const accepted = await db.query.invitation.findFirst({ where: { id: invitationId } });
    expect(accepted?.status).toBe('accepted');
  });

  test('points the session at the joined organization and reaches its workspace', async () => {
    const owner = await seedOwner();
    await insertInvitation({
      organizationId: owner.organizationId,
      inviterId: owner.userId,
      email: INVITEE_EMAIL,
    });

    const invitee = await seedAuthenticatedUser({ email: INVITEE_EMAIL });

    expect(await activeOrganizationId(invitee.cookieHeader)).toBe(owner.organizationId);
    expect(invitee.workspaceId).toBe(owner.workspaceId);
    const response = await app.request(`/workspace/${owner.workspaceId}/folder`, {
      headers: { cookie: invitee.cookieHeader },
    });
    expect(response.status).toBe(StatusCodes.OK);
  });

  test('an expired invitation gives the user their own organization', async () => {
    const owner = await seedOwner();
    const invitationId = await insertInvitation({
      organizationId: owner.organizationId,
      inviterId: owner.userId,
      email: INVITEE_EMAIL,
      expiresAt: new Date(Date.now() - 1000),
    });

    const invitee = await seedAuthenticatedUser({ email: INVITEE_EMAIL });

    expect(await activeOrganizationId(invitee.cookieHeader)).not.toBe(owner.organizationId);
    const row = await db.query.invitation.findFirst({ where: { id: invitationId } });
    expect(row?.status).toBe('pending');
  });

  test('the newest of two invitations wins and the other stays pending', async () => {
    const ownerA = await seedOwner();
    const ownerB = await seedOwner();
    const olderId = await insertInvitation({
      organizationId: ownerA.organizationId,
      inviterId: ownerA.userId,
      email: INVITEE_EMAIL,
      createdAt: new Date(Date.now() - 60_000),
    });
    await insertInvitation({
      organizationId: ownerB.organizationId,
      inviterId: ownerB.userId,
      email: INVITEE_EMAIL,
    });

    const invitee = await seedAuthenticatedUser({ email: INVITEE_EMAIL });

    expect(await activeOrganizationId(invitee.cookieHeader)).toBe(ownerB.organizationId);
    const older = await db.query.invitation.findFirst({ where: { id: olderId } });
    expect(older?.status).toBe('pending');
  });
});
