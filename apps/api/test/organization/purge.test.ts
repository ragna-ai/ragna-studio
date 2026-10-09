import { createMedia, db, sql } from '@repo/database';
import { creditAccount, dataset, organization, user as userTable } from '@repo/database/schema';
import { purgeExpiredDeletions, purgeOrganization } from '@repo/media';
import {
  deleteObjectsMock,
  resetStorageProviderMock,
  seedAuthenticatedUser,
  seedOrganizationMember,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { activeOrganizationId } from './invitation-fixtures';
import { organizationRequest } from './member-fixtures';

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await truncateAllTables();
  resetStorageProviderMock();
});

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

async function seedDeletableOrganization() {
  const owner = await seedAuthenticatedUser();
  const organizationId = await activeOrganizationId(owner.cookieHeader);
  const colleague = await seedOrganizationMember({ organizationId, role: 'member' });
  await db.insert(creditAccount).values({ organizationId });
  const mediaRow = await createMedia({
    ownerWorkspaceId: owner.workspaceId,
    bucket: 'documents-bucket',
    storageKey: `org/${organizationId}/file.pdf`,
    filename: 'file.pdf',
    mimeType: 'application/pdf',
    size: 10,
    origin: 'uploaded',
  });
  return { owner, colleague, organizationId, mediaRow };
}

async function softDeleteOrganizationDaysAgo(organizationId: string, days: number) {
  await db
    .update(organization)
    .set({ deletedAt: daysAgo(days) })
    .where(sql`${organization.id} = ${organizationId}`);
}

async function softDeleteUserDaysAgo(userId: string, days: number) {
  await db
    .update(userTable)
    .set({ deletedAt: daysAgo(days), banned: true, banReason: 'member_removed' })
    .where(sql`${userTable.id} = ${userId}`);
}

describe('purgeOrganization', () => {
  test('removes the organization, its workspaces, credit account and every user', async () => {
    const { owner, colleague, organizationId } = await seedDeletableOrganization();

    await purgeOrganization({ organizationId });

    expect(
      await db.query.organization.findFirst({ where: { id: organizationId } }),
    ).toBeUndefined();
    expect(
      await db.query.workspace.findFirst({ where: { id: owner.workspaceId } }),
    ).toBeUndefined();
    expect(await db.query.creditAccount.findFirst({ where: { organizationId } })).toBeUndefined();
    expect(await db.query.organizationMember.findMany({ where: { organizationId } })).toEqual([]);
    expect(await db.query.user.findFirst({ where: { id: owner.userId } })).toBeUndefined();
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeUndefined();
  });

  test('deletes the R2 objects before any row goes', async () => {
    const { organizationId, mediaRow } = await seedDeletableOrganization();
    let mediaRowExistedAtDeleteTime = false;
    deleteObjectsMock.mockImplementationOnce(async (_bucket, keys) => {
      mediaRowExistedAtDeleteTime =
        (await db.query.media.findFirst({ where: { id: mediaRow.id } })) !== undefined &&
        (await db.query.organization.findFirst({ where: { id: organizationId } })) !== undefined;
      return { deleted: keys, errors: [] };
    });

    await purgeOrganization({ organizationId });

    expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectsMock.mock.calls[0]).toEqual(['documents-bucket', [mediaRow.storageKey]]);
    expect(mediaRowExistedAtDeleteTime).toBe(true);
  });

  test('keeps the rows when R2 deletion fails, so the next run retries', async () => {
    const { organizationId, owner } = await seedDeletableOrganization();
    deleteObjectsMock.mockImplementationOnce(() => Promise.reject(new Error('R2 down')));

    await expect(purgeOrganization({ organizationId })).rejects.toThrow();

    expect(await db.query.organization.findFirst({ where: { id: organizationId } })).toBeDefined();
    expect(await db.query.user.findFirst({ where: { id: owner.userId } })).toBeDefined();
  });
});

describe('purgeExpiredDeletions', () => {
  test('leaves organizations and users inside the 30 day window alone', async () => {
    const { organizationId, colleague } = await seedDeletableOrganization();
    const solo = await seedAuthenticatedUser();
    await softDeleteOrganizationDaysAgo(organizationId, 29);
    await softDeleteUserDaysAgo(solo.userId, 29);

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 0, usersPurged: 0, failures: 0 });
    expect(await db.query.organization.findFirst({ where: { id: organizationId } })).toBeDefined();
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeDefined();
    expect(await db.query.user.findFirst({ where: { id: solo.userId } })).toBeDefined();
    expect(deleteObjectsMock).not.toHaveBeenCalled();
  });

  test('purges organizations deleted more than 30 days ago', async () => {
    const { organizationId, colleague, owner } = await seedDeletableOrganization();
    await softDeleteOrganizationDaysAgo(organizationId, 31);

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 1, usersPurged: 0, failures: 0 });
    expect(
      await db.query.organization.findFirst({ where: { id: organizationId } }),
    ).toBeUndefined();
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeUndefined();
    expect(await db.query.user.findFirst({ where: { id: owner.userId } })).toBeUndefined();
    expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
  });

  test('purges removed users, keeping their shared work with a null author', async () => {
    const { organizationId, owner, colleague } = await seedDeletableOrganization();
    const [sharedDataset] = await db
      .insert(dataset)
      .values({ userId: colleague.userId, workspaceId: owner.workspaceId, name: 'Shared' })
      .returning();
    await softDeleteUserDaysAgo(colleague.userId, 31);

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 0, usersPurged: 1, failures: 0 });
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeUndefined();
    expect(await db.query.organization.findFirst({ where: { id: organizationId } })).toBeDefined();
    const kept = await db.query.dataset.findFirst({ where: { id: sharedDataset?.id ?? '' } });
    expect(kept).toMatchObject({ name: 'Shared', userId: null });
  });

  test('deletes the personal workspace R2 objects before the removed user row', async () => {
    const { colleague } = await seedDeletableOrganization();
    const personalMedia = await createMedia({
      ownerWorkspaceId: colleague.personalWorkspaceId,
      bucket: 'documents-bucket',
      storageKey: `user/${colleague.userId}/private.pdf`,
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      size: 10,
      origin: 'uploaded',
    });
    await softDeleteUserDaysAgo(colleague.userId, 31);
    let userRowExistedAtDeleteTime = false;
    deleteObjectsMock.mockImplementationOnce(async (_bucket, keys) => {
      userRowExistedAtDeleteTime =
        (await db.query.user.findFirst({ where: { id: colleague.userId } })) !== undefined;
      return { deleted: keys, errors: [] };
    });

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 0, usersPurged: 1, failures: 0 });
    expect(deleteObjectsMock.mock.calls[0]).toEqual([
      'documents-bucket',
      [personalMedia.storageKey],
    ]);
    expect(userRowExistedAtDeleteTime).toBe(true);
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeUndefined();
  });

  test('keeps a removed user when their personal workspace R2 cleanup fails', async () => {
    const { colleague } = await seedDeletableOrganization();
    await createMedia({
      ownerWorkspaceId: colleague.personalWorkspaceId,
      bucket: 'documents-bucket',
      storageKey: `user/${colleague.userId}/private.pdf`,
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      size: 10,
      origin: 'uploaded',
    });
    await softDeleteUserDaysAgo(colleague.userId, 31);
    deleteObjectsMock.mockImplementationOnce(() => Promise.reject(new Error('R2 down')));

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 0, usersPurged: 0, failures: 1 });
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeDefined();
    expect(
      await db.query.workspace.findFirst({ where: { id: colleague.personalWorkspaceId } }),
    ).toBeDefined();
  });

  test('does not purge members of a restored organization', async () => {
    const { owner, colleague, organizationId } = await seedDeletableOrganization();
    await organizationRequest(owner.cookieHeader, 'DELETE', '');
    await organizationRequest(owner.cookieHeader, 'POST', '/restore');

    const summary = await purgeExpiredDeletions({ now: new Date(Date.now() + 40 * DAY_MS) });

    expect(summary).toEqual({ organizationsPurged: 0, usersPurged: 0, failures: 0 });
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeDefined();
    expect(await db.query.organization.findFirst({ where: { id: organizationId } })).toBeDefined();
  });

  test('leaves the users of a deleted organization to the organization purge', async () => {
    const { organizationId, colleague } = await seedDeletableOrganization();
    await softDeleteOrganizationDaysAgo(organizationId, 10);
    await softDeleteUserDaysAgo(colleague.userId, 31);

    const summary = await purgeExpiredDeletions();

    expect(summary.usersPurged).toBe(0);
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeDefined();
  });

  test('one failing organization does not block the next', async () => {
    const first = await seedDeletableOrganization();
    const second = await seedDeletableOrganization();
    await softDeleteOrganizationDaysAgo(first.organizationId, 40);
    await softDeleteOrganizationDaysAgo(second.organizationId, 31);
    deleteObjectsMock.mockImplementationOnce(() => Promise.reject(new Error('R2 down')));

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 1, usersPurged: 0, failures: 1 });
    expect(
      await db.query.organization.findFirst({ where: { id: first.organizationId } }),
    ).toBeDefined();
    expect(
      await db.query.organization.findFirst({ where: { id: second.organizationId } }),
    ).toBeUndefined();
  });
});
