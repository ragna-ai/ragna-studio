import { db } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

beforeEach(async () => {
  await truncateAllTables();
});

describe('sign-up', () => {
  test('creates the organization, an owner membership and the Personal workspace', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();

    const members = await db.query.member.findMany({ where: { userId } });
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');

    const organizationId = members[0]?.organizationId ?? '';
    const organization = await db.query.organization.findFirst({ where: { id: organizationId } });
    const user = await db.query.user.findFirst({ where: { id: userId } });
    expect(organization?.name).toBe(user?.name);
    expect(organization?.slug).toBe(organizationId);

    const workspace = await db.query.workspace.findFirst({ where: { id: workspaceId } });
    expect(workspace?.name).toBe('Personal');
    expect(workspace?.organizationId).toBe(organizationId);
  });

  test('gives each user their own organization', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();

    const memberA = await db.query.member.findFirst({ where: { userId: userA.userId } });
    const memberB = await db.query.member.findFirst({ where: { userId: userB.userId } });

    expect(memberA?.organizationId).not.toBe(memberB?.organizationId);
  });
});

describe('session creation', () => {
  test("sets activeOrganizationId to the user's organization", async () => {
    const { userId } = await seedAuthenticatedUser();

    const member = await db.query.member.findFirst({ where: { userId } });
    const sessions = await db.query.session.findMany({ where: { userId } });

    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(session.activeOrganizationId).toBe(member?.organizationId ?? null);
    }
  });
});
