import { db } from '@repo/database';
import { PURGE_ORGANIZATION_JOB, purgeOrganizationJobSchema } from '@repo/queue';
import {
  deleteSeededUser,
  queueAddMock,
  resetQueueMock,
  seedAuthenticatedUser,
  seedOrganizationMember,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

beforeEach(async () => {
  await truncateAllTables();
  resetQueueMock();
});

async function organizationIdOf(userId: string): Promise<string> {
  const membership = await db.query.organizationMember.findFirst({ where: { userId } });
  return membership?.organizationId ?? '';
}

describe('user deletion', () => {
  test('a sole owner leaves the organization marked deleted and queued for the purge', async () => {
    const { userId } = await seedAuthenticatedUser();
    const organizationId = await organizationIdOf(userId);

    await deleteSeededUser({ userId });

    const markedDeleted = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(markedDeleted?.deletedAt).toBeInstanceOf(Date);
    const purgeCalls = queueAddMock.mock.calls.filter(([name]) => name === PURGE_ORGANIZATION_JOB);
    expect(purgeCalls.map(([, data]) => purgeOrganizationJobSchema.parse(data))).toEqual([
      { organizationId },
    ]);
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
