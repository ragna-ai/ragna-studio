import { getWorkspaceAccess } from '@repo/database';
import { truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import {
  deleteWorkspaceMember,
  insertWorkspace,
  insertWorkspaceMember,
  requestFolders,
  seedOrganizationWithRoles,
} from './workspace-access-fixtures';

// Who may open a workspace, per visibility, as seen through workspaceGuard.

beforeEach(async () => {
  await truncateAllTables();
});

describe('personal workspace', () => {
  test('opens for its user only', async () => {
    const { member, otherMember } = await seedOrganizationWithRoles();

    expect((await requestFolders(member.personalWorkspaceId, member.cookieHeader)).status).toBe(
      StatusCodes.OK,
    );
    expect(
      (await requestFolders(member.personalWorkspaceId, otherMember.cookieHeader)).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  test('stays closed to the org owner and the org admin', async () => {
    const { owner, admin, member } = await seedOrganizationWithRoles();

    expect((await requestFolders(member.personalWorkspaceId, owner.cookieHeader)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await requestFolders(member.personalWorkspaceId, admin.cookieHeader)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  test('gives its user the workspace role manager', async () => {
    const { member } = await seedOrganizationWithRoles();

    const access = await getWorkspaceAccess({
      workspaceId: member.personalWorkspaceId,
      userId: member.userId,
    });

    expect(access?.workspaceRole).toBe('manager');
  });
});

describe('organization workspace', () => {
  test('opens for every org member', async () => {
    const { owner, admin, member, otherMember } = await seedOrganizationWithRoles();

    for (const user of [owner, admin, member, otherMember]) {
      const response = await requestFolders(owner.workspaceId, user.cookieHeader);
      expect(response.status).toBe(StatusCodes.OK);
    }
  });

  test('does not open for a user of another organization', async () => {
    const { owner } = await seedOrganizationWithRoles();
    const { owner: stranger } = await seedOrganizationWithRoles();

    const response = await requestFolders(owner.workspaceId, stranger.cookieHeader);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('maps org roles to workspace roles', async () => {
    const { owner, admin, member } = await seedOrganizationWithRoles();
    const roleOf = async (userId: string) =>
      (await getWorkspaceAccess({ workspaceId: owner.workspaceId, userId }))?.workspaceRole;

    expect(await roleOf(owner.userId)).toBe('manager');
    expect(await roleOf(admin.userId)).toBe('manager');
    expect(await roleOf(member.userId)).toBe('editor');
  });

  test('gives an org member with a manager row the workspace role manager', async () => {
    const { owner, member } = await seedOrganizationWithRoles();
    await insertWorkspaceMember({
      workspaceId: owner.workspaceId,
      userId: member.userId,
      role: 'manager',
    });

    const access = await getWorkspaceAccess({
      workspaceId: owner.workspaceId,
      userId: member.userId,
    });

    expect(access?.workspaceRole).toBe('manager');
  });
});

describe('restricted workspace', () => {
  test('opens for workspace members, org owners and org admins only', async () => {
    const { organizationId, owner, admin, member, otherMember } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'editor' });

    const statusFor = async (cookieHeader: string) =>
      (await requestFolders(workspaceId, cookieHeader)).status;

    expect(await statusFor(member.cookieHeader)).toBe(StatusCodes.OK);
    expect(await statusFor(owner.cookieHeader)).toBe(StatusCodes.OK);
    expect(await statusFor(admin.cookieHeader)).toBe(StatusCodes.OK);
    expect(await statusFor(otherMember.cookieHeader)).toBe(StatusCodes.NOT_FOUND);
  });

  test('gives org owners and org admins manager and workspace members their row role', async () => {
    const { organizationId, owner, admin, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'editor' });
    const roleOf = async (userId: string) =>
      (await getWorkspaceAccess({ workspaceId, userId }))?.workspaceRole;

    expect(await roleOf(owner.userId)).toBe('manager');
    expect(await roleOf(admin.userId)).toBe('manager');
    expect(await roleOf(member.userId)).toBe('editor');
  });

  test('removing the workspace member row revokes access at once', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'editor' });
    expect((await requestFolders(workspaceId, member.cookieHeader)).status).toBe(StatusCodes.OK);

    await deleteWorkspaceMember({ workspaceId, userId: member.userId });

    expect((await requestFolders(workspaceId, member.cookieHeader)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });
});
