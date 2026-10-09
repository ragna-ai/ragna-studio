import { db } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { activeOrganizationId, insertInvitation } from '../organization/invitation-fixtures';
import { requestFolders } from './workspace-access-fixtures';

beforeEach(async () => {
  await truncateAllTables();
});

describe('sign-up personal workspace', () => {
  test('a new user gets a personal workspace in their own organization', async () => {
    const user = await seedAuthenticatedUser();

    const personal = await db.query.workspace.findFirst({
      where: { id: user.personalWorkspaceId },
    });

    expect(personal).toMatchObject({
      name: 'Personal',
      visibility: 'personal',
      personalUserId: user.userId,
      organizationId: await activeOrganizationId(user.cookieHeader),
    });
  });

  test('a new organization starts with no workspace besides the personal one', async () => {
    const user = await seedAuthenticatedUser();

    const workspaces = await db.query.workspace.findMany({
      where: { organizationId: await activeOrganizationId(user.cookieHeader) },
    });

    expect(workspaces.filter((row) => row.visibility !== 'personal')).toHaveLength(1);
    expect(workspaces.map((row) => row.id)).toContain(user.personalWorkspaceId);
  });

  test('an invitee gets a personal workspace in the inviting organization', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    await insertInvitation({
      organizationId,
      inviterId: owner.userId,
      email: 'invitee@example.com',
    });

    const invitee = await seedAuthenticatedUser({ email: 'invitee@example.com' });

    const personal = await db.query.workspace.findFirst({
      where: { personalUserId: invitee.userId },
    });
    expect(personal).toMatchObject({ organizationId, visibility: 'personal', name: 'Personal' });
    expect(invitee.personalWorkspaceId).toBe(personal?.id ?? '');
    expect((await requestFolders(invitee.personalWorkspaceId, invitee.cookieHeader)).status).toBe(
      200,
    );
    expect((await requestFolders(invitee.personalWorkspaceId, owner.cookieHeader)).status).toBe(
      404,
    );
  });
});
