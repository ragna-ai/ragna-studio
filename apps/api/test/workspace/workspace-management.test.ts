import { db } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import {
  insertWorkspace,
  insertWorkspaceMember,
  seedOrganizationWithRoles,
} from './workspace-access-fixtures';
import { jsonRequest, softDeleteUser } from './workspace-request-fixtures';

const createdWorkspaceSchema = z.strictObject({
  workspace: z.strictObject({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    visibility: z.enum(['organization', 'restricted']),
    personalUserId: z.null(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.null(),
  }),
});

beforeEach(async () => {
  await truncateAllTables();
});

async function memberRowsOf(workspaceId: string) {
  const rows = await db.query.workspaceMember.findMany({ where: { workspaceId } });
  return new Map(rows.map((row) => [row.userId, row.role]));
}

describe('POST /workspace', () => {
  test('requires a visibility', async () => {
    const { owner } = await seedOrganizationWithRoles();

    const response = await jsonRequest(owner.cookieHeader, 'POST', '/workspace', { name: 'Team' });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('rejects the personal visibility', async () => {
    const { owner } = await seedOrganizationWithRoles();

    const response = await jsonRequest(owner.cookieHeader, 'POST', '/workspace', {
      name: 'Team',
      visibility: 'personal',
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('makes the creator a manager of an organization workspace', async () => {
    const { member } = await seedOrganizationWithRoles();

    const response = await jsonRequest(member.cookieHeader, 'POST', '/workspace', {
      name: 'Team',
      visibility: 'organization',
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const { workspace } = createdWorkspaceSchema.parse(await response.json());
    expect(workspace.visibility).toBe('organization');
    expect(await memberRowsOf(workspace.id)).toEqual(new Map([[member.userId, 'manager']]));
  });

  test('adds memberUserIds to a restricted workspace as editors', async () => {
    const { member, otherMember, owner } = await seedOrganizationWithRoles();

    const response = await jsonRequest(member.cookieHeader, 'POST', '/workspace', {
      name: 'Secret',
      visibility: 'restricted',
      memberUserIds: [otherMember.userId, owner.userId, otherMember.userId, member.userId],
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const { workspace } = createdWorkspaceSchema.parse(await response.json());
    expect(await memberRowsOf(workspace.id)).toEqual(
      new Map([
        [member.userId, 'manager'],
        [otherMember.userId, 'editor'],
        [owner.userId, 'editor'],
      ]),
    );
  });

  test('rejects memberUserIds on an organization workspace', async () => {
    const { member, otherMember } = await seedOrganizationWithRoles();

    const response = await jsonRequest(member.cookieHeader, 'POST', '/workspace', {
      name: 'Team',
      visibility: 'organization',
      memberUserIds: [otherMember.userId],
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects a user from another organization and creates nothing', async () => {
    const { member } = await seedOrganizationWithRoles();
    const outsider = await seedAuthenticatedUser();
    const before = await db.query.workspace.findMany();

    const response = await jsonRequest(member.cookieHeader, 'POST', '/workspace', {
      name: 'Secret',
      visibility: 'restricted',
      memberUserIds: [outsider.userId],
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await db.query.workspace.findMany()).toHaveLength(before.length);
  });

  test('rejects an unknown user id', async () => {
    const { member } = await seedOrganizationWithRoles();

    const response = await jsonRequest(member.cookieHeader, 'POST', '/workspace', {
      name: 'Secret',
      visibility: 'restricted',
      memberUserIds: [crypto.randomUUID()],
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects a soft-deleted organization member', async () => {
    const { member, otherMember } = await seedOrganizationWithRoles();
    await softDeleteUser(otherMember.userId);

    const response = await jsonRequest(member.cookieHeader, 'POST', '/workspace', {
      name: 'Secret',
      visibility: 'restricted',
      memberUserIds: [otherMember.userId],
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('PATCH /workspace/:workspaceId', () => {
  test('lets a workspace manager rename', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'organization' });
    await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'manager' });

    const response = await jsonRequest(member.cookieHeader, 'PATCH', `/workspace/${workspaceId}`, {
      name: 'Renamed',
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(createdWorkspaceSchema.parse(await response.json()).workspace.name).toBe('Renamed');
  });

  test('lets an org admin rename without a manager row', async () => {
    const { organizationId, admin } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'organization' });

    const response = await jsonRequest(admin.cookieHeader, 'PATCH', `/workspace/${workspaceId}`, {
      name: 'Renamed',
    });

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('forbids an org member without a manager row on an organization workspace', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'organization' });

    const response = await jsonRequest(member.cookieHeader, 'PATCH', `/workspace/${workspaceId}`, {
      name: 'Renamed',
    });

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('forbids a workspace editor of a restricted workspace', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'editor' });

    const response = await jsonRequest(member.cookieHeader, 'PATCH', `/workspace/${workspaceId}`, {
      name: 'Renamed',
    });

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('answers 404 for an org member outside a restricted workspace', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });

    const response = await jsonRequest(member.cookieHeader, 'PATCH', `/workspace/${workspaceId}`, {
      name: 'Renamed',
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId', () => {
  test('lets a workspace manager delete', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'manager' });

    const response = await jsonRequest(member.cookieHeader, 'DELETE', `/workspace/${workspaceId}`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await db.query.workspace.findFirst({ where: { id: workspaceId } })).toBeUndefined();
  });

  test('forbids an org member without a manager row and keeps the workspace', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'organization' });

    const response = await jsonRequest(member.cookieHeader, 'DELETE', `/workspace/${workspaceId}`);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await db.query.workspace.findFirst({ where: { id: workspaceId } })).toBeDefined();
  });

  test('rejects deleting a personal workspace', async () => {
    const { owner } = await seedOrganizationWithRoles();

    const response = await jsonRequest(
      owner.cookieHeader,
      'DELETE',
      `/workspace/${owner.personalWorkspaceId}`,
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('lets the last shared workspace be deleted', async () => {
    const owner = await seedAuthenticatedUser();

    const response = await jsonRequest(
      owner.cookieHeader,
      'DELETE',
      `/workspace/${owner.workspaceId}`,
    );

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('answers 404 for a user of another organization', async () => {
    const { organizationId } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'organization' });
    const outsider = await seedAuthenticatedUser();

    const response = await jsonRequest(
      outsider.cookieHeader,
      'DELETE',
      `/workspace/${workspaceId}`,
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
