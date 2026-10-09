import { db } from '@repo/database';
import { creditAccount, member } from '@repo/database/schema';
import { deleteSeededUser, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

beforeEach(async () => {
  await truncateAllTables();
});

async function organizationIdOf(userId: string): Promise<string> {
  const membership = await db.query.member.findFirst({ where: { userId } });
  return membership?.organizationId ?? '';
}

describe('user deletion', () => {
  test('removes the sole-owned organization, its workspaces and credit account', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const organizationId = await organizationIdOf(userId);
    await db.insert(creditAccount).values({ userId, organizationId });

    await deleteSeededUser({ userId });

    expect(
      await db.query.organization.findFirst({ where: { id: organizationId } }),
    ).toBeUndefined();
    expect(await db.query.workspace.findFirst({ where: { id: workspaceId } })).toBeUndefined();
    expect(await db.query.member.findMany({ where: { organizationId } })).toEqual([]);
    expect(await db.query.creditAccount.findFirst({ where: { organizationId } })).toBeUndefined();
  });

  test('keeps an organization that still has another owner', async () => {
    const owner = await seedAuthenticatedUser();
    const coOwner = await seedAuthenticatedUser();
    const organizationId = await organizationIdOf(owner.userId);
    await db.insert(member).values({
      organizationId,
      userId: coOwner.userId,
      role: 'owner',
      createdAt: new Date(),
    });

    await deleteSeededUser({ userId: owner.userId });

    expect(await db.query.organization.findFirst({ where: { id: organizationId } })).toBeDefined();
  });
});
