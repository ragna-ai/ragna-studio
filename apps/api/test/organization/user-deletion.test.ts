import { db } from '@repo/database';
import { creditAccount } from '@repo/database/schema';
import { purgeOrganization } from '@repo/media';
import {
  deleteSeededUser,
  seedAuthenticatedUser,
  seedOrganizationMember,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

beforeEach(async () => {
  await truncateAllTables();
});

async function organizationIdOf(userId: string): Promise<string> {
  const membership = await db.query.organizationMember.findFirst({ where: { userId } });
  return membership?.organizationId ?? '';
}

describe('user deletion', () => {
  test('a sole owner leaves the organization deleted until the purge removes it', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const organizationId = await organizationIdOf(userId);
    await db.insert(creditAccount).values({ organizationId });

    await deleteSeededUser({ userId });
    const markedDeleted = await db.query.organization.findFirst({ where: { id: organizationId } });
    await purgeOrganization({ organizationId });

    expect(markedDeleted?.deletedAt).toBeInstanceOf(Date);
    expect(
      await db.query.organization.findFirst({ where: { id: organizationId } }),
    ).toBeUndefined();
    expect(await db.query.workspace.findFirst({ where: { id: workspaceId } })).toBeUndefined();
    expect(await db.query.organizationMember.findMany({ where: { organizationId } })).toEqual([]);
    expect(await db.query.creditAccount.findFirst({ where: { organizationId } })).toBeUndefined();
  });

  test('is blocked while the organization has other active members', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await organizationIdOf(owner.userId);
    await seedOrganizationMember({ organizationId, role: 'member' });

    await expect(deleteSeededUser({ userId: owner.userId })).rejects.toThrow(
      'Transfer ownership or delete the organization first.',
    );

    expect(await db.query.user.findFirst({ where: { id: owner.userId } })).toBeDefined();
    const org = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(org?.deletedAt).toBeNull();
  });
});
