import { db } from '@repo/database';
import { seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import {
  insertWorkspace,
  insertWorkspaceMember,
  seedOrganizationWithRoles,
  type OrganizationWithRoles,
} from './workspace-access-fixtures';
import { jsonRequest, softDeleteUser } from './workspace-request-fixtures';

const membersSchema = z.strictObject({
  members: z.array(
    z.strictObject({
      userId: z.string(),
      workspaceRole: z.enum(['manager', 'editor']),
      createdAt: z.string(),
      name: z.string(),
      email: z.string(),
      image: z.string().nullable(),
    }),
  ),
});

beforeEach(async () => {
  await truncateAllTables();
});

const membersPath = (workspaceId: string, userId = '') =>
  `/workspace/${workspaceId}/members${userId ? `/${userId}` : ''}`;

async function roleOf(workspaceId: string, userId: string) {
  const row = await db.query.workspaceMember.findFirst({ where: { workspaceId, userId } });
  return row?.role;
}

/** A restricted workspace where `member` is manager and `otherMember` is editor. */
async function seedRestricted(org: OrganizationWithRoles) {
  const workspaceId = await insertWorkspace({
    organizationId: org.organizationId,
    visibility: 'restricted',
  });
  await insertWorkspaceMember({ workspaceId, userId: org.member.userId, role: 'manager' });
  await insertWorkspaceMember({ workspaceId, userId: org.otherMember.userId, role: 'editor' });
  return workspaceId;
}

describe('GET /workspace/:workspaceId/members', () => {
  test('lists workspace members with their user and role for an editor', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.otherMember.cookieHeader,
      'GET',
      membersPath(workspaceId),
    );

    expect(response.status).toBe(StatusCodes.OK);
    const { members } = membersSchema.parse(await response.json());
    expect(members.map((row) => [row.userId, row.workspaceRole])).toEqual([
      [org.member.userId, 'manager'],
      [org.otherMember.userId, 'editor'],
    ]);
  });

  test('answers 404 to an org member outside the restricted workspace', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);
    const stranger = await seedOrganizationMember({
      organizationId: org.organizationId,
      role: 'member',
    });

    const response = await jsonRequest(stranger.cookieHeader, 'GET', membersPath(workspaceId));

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('is a 400 on a personal workspace', async () => {
    const { owner } = await seedOrganizationWithRoles();

    const response = await jsonRequest(
      owner.cookieHeader,
      'GET',
      membersPath(owner.personalWorkspaceId),
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('POST /workspace/:workspaceId/members', () => {
  test('a manager adds an org member as editor', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(org.member.cookieHeader, 'POST', membersPath(workspaceId), {
      userId: org.admin.userId,
      workspaceRole: 'editor',
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(await roleOf(workspaceId, org.admin.userId)).toBe('editor');
  });

  test('an editor cannot add', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.otherMember.cookieHeader,
      'POST',
      membersPath(workspaceId),
      { userId: org.admin.userId, workspaceRole: 'editor' },
    );

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await roleOf(workspaceId, org.admin.userId)).toBeUndefined();
  });

  test('an org admin without a row can add', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(org.admin.cookieHeader, 'POST', membersPath(workspaceId), {
      userId: org.owner.userId,
      workspaceRole: 'manager',
    });

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test('rejects a user of another organization', async () => {
    const org = await seedOrganizationWithRoles();
    const other = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(org.member.cookieHeader, 'POST', membersPath(workspaceId), {
      userId: other.member.userId,
      workspaceRole: 'editor',
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects a soft-deleted org member', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);
    await softDeleteUser(org.admin.userId);

    const response = await jsonRequest(org.member.cookieHeader, 'POST', membersPath(workspaceId), {
      userId: org.admin.userId,
      workspaceRole: 'editor',
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('answers 409 for a user who is already a member', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(org.member.cookieHeader, 'POST', membersPath(workspaceId), {
      userId: org.otherMember.userId,
      workspaceRole: 'manager',
    });

    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await roleOf(workspaceId, org.otherMember.userId)).toBe('editor');
  });

  test('an organization workspace accepts manager rows only', async () => {
    const org = await seedOrganizationWithRoles();

    const editorResponse = await jsonRequest(
      org.admin.cookieHeader,
      'POST',
      membersPath(
        await insertWorkspace({ organizationId: org.organizationId, visibility: 'organization' }),
      ),
      { userId: org.member.userId, workspaceRole: 'editor' },
    );
    expect(editorResponse.status).toBe(StatusCodes.BAD_REQUEST);

    const workspaceId = await insertWorkspace({
      organizationId: org.organizationId,
      visibility: 'organization',
    });
    const managerResponse = await jsonRequest(
      org.admin.cookieHeader,
      'POST',
      membersPath(workspaceId),
      { userId: org.member.userId, workspaceRole: 'manager' },
    );
    expect(managerResponse.status).toBe(StatusCodes.CREATED);
    expect(await roleOf(workspaceId, org.member.userId)).toBe('manager');
  });

  test('is a 400 on a personal workspace', async () => {
    const { owner, member } = await seedOrganizationWithRoles();

    const response = await jsonRequest(
      owner.cookieHeader,
      'POST',
      membersPath(owner.personalWorkspaceId),
      { userId: member.userId, workspaceRole: 'manager' },
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('malformed user ids', () => {
  test('POST rejects a malformed userId', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(org.member.cookieHeader, 'POST', membersPath(workspaceId), {
      userId: 'not-a-uuid',
      workspaceRole: 'editor',
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('PATCH rejects a malformed :userId', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.member.cookieHeader,
      'PATCH',
      membersPath(workspaceId, 'not-a-uuid'),
      { workspaceRole: 'editor' },
    );

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('DELETE rejects a malformed :userId', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.member.cookieHeader,
      'DELETE',
      membersPath(workspaceId, 'not-a-uuid'),
    );

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('PATCH /workspace/:workspaceId/members/:userId', () => {
  test('a manager changes a role', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.member.cookieHeader,
      'PATCH',
      membersPath(workspaceId, org.otherMember.userId),
      { workspaceRole: 'manager' },
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(await roleOf(workspaceId, org.otherMember.userId)).toBe('manager');
  });

  test('an editor cannot change roles', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.otherMember.cookieHeader,
      'PATCH',
      membersPath(workspaceId, org.otherMember.userId),
      { workspaceRole: 'manager' },
    );

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await roleOf(workspaceId, org.otherMember.userId)).toBe('editor');
  });

  test('answers 404 for a user without a row', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.member.cookieHeader,
      'PATCH',
      membersPath(workspaceId, org.admin.userId),
      { workspaceRole: 'editor' },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('an organization workspace has no editor role to change to', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({
      organizationId: org.organizationId,
      visibility: 'organization',
    });
    await insertWorkspaceMember({ workspaceId, userId: org.member.userId, role: 'manager' });

    const response = await jsonRequest(
      org.admin.cookieHeader,
      'PATCH',
      membersPath(workspaceId, org.member.userId),
      { workspaceRole: 'editor' },
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await roleOf(workspaceId, org.member.userId)).toBe('manager');
  });

  test('is a 400 on a personal workspace', async () => {
    const { owner } = await seedOrganizationWithRoles();

    const response = await jsonRequest(
      owner.cookieHeader,
      'PATCH',
      membersPath(owner.personalWorkspaceId, owner.userId),
      { workspaceRole: 'manager' },
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('DELETE /workspace/:workspaceId/members/:userId', () => {
  test('a manager removes a member, who then loses access', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.member.cookieHeader,
      'DELETE',
      membersPath(workspaceId, org.otherMember.userId),
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(await roleOf(workspaceId, org.otherMember.userId)).toBeUndefined();
    const after = await jsonRequest(org.otherMember.cookieHeader, 'GET', membersPath(workspaceId));
    expect(after.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('an editor leaves by removing themselves', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.otherMember.cookieHeader,
      'DELETE',
      membersPath(workspaceId, org.otherMember.userId),
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(await roleOf(workspaceId, org.otherMember.userId)).toBeUndefined();
  });

  test('an editor cannot remove someone else', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.otherMember.cookieHeader,
      'DELETE',
      membersPath(workspaceId, org.member.userId),
    );

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await roleOf(workspaceId, org.member.userId)).toBe('manager');
  });

  test('the last manager can leave', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.member.cookieHeader,
      'DELETE',
      membersPath(workspaceId, org.member.userId),
    );

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('answers 404 for a user without a row', async () => {
    const org = await seedOrganizationWithRoles();
    const workspaceId = await seedRestricted(org);

    const response = await jsonRequest(
      org.member.cookieHeader,
      'DELETE',
      membersPath(workspaceId, org.admin.userId),
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('is a 400 on a personal workspace', async () => {
    const { owner } = await seedOrganizationWithRoles();

    const response = await jsonRequest(
      owner.cookieHeader,
      'DELETE',
      membersPath(owner.personalWorkspaceId, owner.userId),
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
