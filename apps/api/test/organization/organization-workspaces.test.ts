import { truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import {
  insertWorkspace,
  insertWorkspaceMember,
  seedOrganizationWithRoles,
} from '../workspace/workspace-access-fixtures';
import { organizationRequest } from './member-fixtures';

const workspacesSchema = z.strictObject({
  workspaces: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      memberCount: z.number(),
      isWorkspaceMember: z.boolean(),
      createdAt: z.string(),
    }),
  ),
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('GET /organization/workspaces', () => {
  test('lists only restricted workspaces with member counts and the caller flag', async () => {
    const org = await seedOrganizationWithRoles();
    await insertWorkspace({ organizationId: org.organizationId, visibility: 'organization' });
    const withMembers = await insertWorkspace({
      organizationId: org.organizationId,
      visibility: 'restricted',
      name: 'Finance',
    });
    const empty = await insertWorkspace({
      organizationId: org.organizationId,
      visibility: 'restricted',
      name: 'Empty',
    });
    await insertWorkspaceMember({
      workspaceId: withMembers,
      userId: org.member.userId,
      role: 'manager',
    });
    await insertWorkspaceMember({
      workspaceId: withMembers,
      userId: org.owner.userId,
      role: 'editor',
    });

    const response = await organizationRequest(org.owner.cookieHeader, 'GET', '/workspaces');

    expect(response.status).toBe(StatusCodes.OK);
    const { workspaces } = workspacesSchema.parse(await response.json());
    expect(workspaces.map((row) => [row.id, row.memberCount, row.isWorkspaceMember])).toEqual([
      [withMembers, 2, true],
      [empty, 0, false],
    ]);
  });

  test('an org admin can read the list', async () => {
    const org = await seedOrganizationWithRoles();
    await insertWorkspace({ organizationId: org.organizationId, visibility: 'restricted' });

    const response = await organizationRequest(org.admin.cookieHeader, 'GET', '/workspaces');

    expect(response.status).toBe(StatusCodes.OK);
    expect(workspacesSchema.parse(await response.json()).workspaces).toHaveLength(1);
  });

  test('forbids a plain org member', async () => {
    const org = await seedOrganizationWithRoles();

    const response = await organizationRequest(org.member.cookieHeader, 'GET', '/workspaces');

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test("does not list another organization's workspaces", async () => {
    const org = await seedOrganizationWithRoles();
    const other = await seedOrganizationWithRoles();
    await insertWorkspace({ organizationId: other.organizationId, visibility: 'restricted' });

    const response = await organizationRequest(org.owner.cookieHeader, 'GET', '/workspaces');

    expect(workspacesSchema.parse(await response.json()).workspaces).toHaveLength(0);
  });
});
