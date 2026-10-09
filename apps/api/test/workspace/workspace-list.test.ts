import { truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  insertWorkspace,
  insertWorkspaceMember,
  seedOrganizationWithRoles,
} from './workspace-access-fixtures';

const listedWorkspaceSchema = z.strictObject({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  visibility: z.enum(['personal', 'organization', 'restricted']),
  workspaceRole: z.enum(['manager', 'editor']),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
const listResponseSchema = z.strictObject({ workspaces: z.array(listedWorkspaceSchema) });

async function listWorkspaces(cookieHeader: string) {
  const response = await app.request('/workspace', { headers: { cookie: cookieHeader } });
  expect(response.status).toBe(StatusCodes.OK);
  return listResponseSchema.parse(await response.json()).workspaces;
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('GET /workspace', () => {
  test('lists organization workspaces and the own personal one with workspace roles', async () => {
    const { owner, member } = await seedOrganizationWithRoles();

    const workspaces = await listWorkspaces(member.cookieHeader);

    expect(
      workspaces.map(({ id, visibility, workspaceRole }) => ({ id, visibility, workspaceRole })),
    ).toEqual(
      expect.arrayContaining([
        { id: owner.workspaceId, visibility: 'organization', workspaceRole: 'editor' },
        { id: member.personalWorkspaceId, visibility: 'personal', workspaceRole: 'manager' },
      ]),
    );
    expect(workspaces).toHaveLength(2);
  });

  test("never lists a colleague's personal workspace, not even for the org owner", async () => {
    const { owner, member } = await seedOrganizationWithRoles();

    const ids = (await listWorkspaces(owner.cookieHeader)).map((workspace) => workspace.id);

    expect(ids).not.toContain(member.personalWorkspaceId);
  });

  test('lists a restricted workspace only for its workspace members', async () => {
    const { organizationId, owner, admin, member, otherMember } = await seedOrganizationWithRoles();
    const restrictedId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({
      workspaceId: restrictedId,
      userId: member.userId,
      role: 'editor',
    });
    const idsFor = async (cookieHeader: string) =>
      (await listWorkspaces(cookieHeader)).map((workspace) => workspace.id);

    expect(await idsFor(member.cookieHeader)).toContain(restrictedId);
    expect(await idsFor(otherMember.cookieHeader)).not.toContain(restrictedId);
    expect(await idsFor(owner.cookieHeader)).not.toContain(restrictedId);
    expect(await idsFor(admin.cookieHeader)).not.toContain(restrictedId);
  });

  test("reports the row's workspace role for a restricted workspace member", async () => {
    const { organizationId, owner, member } = await seedOrganizationWithRoles();
    const restrictedId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({
      workspaceId: restrictedId,
      userId: member.userId,
      role: 'editor',
    });
    await insertWorkspaceMember({
      workspaceId: restrictedId,
      userId: owner.userId,
      role: 'editor',
    });

    const roleIn = async (cookieHeader: string) =>
      (await listWorkspaces(cookieHeader)).find((workspace) => workspace.id === restrictedId)
        ?.workspaceRole;

    expect(await roleIn(member.cookieHeader)).toBe('editor');
    expect(await roleIn(owner.cookieHeader)).toBe('manager');
  });
});
