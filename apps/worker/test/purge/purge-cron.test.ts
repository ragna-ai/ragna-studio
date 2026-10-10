import { purgeExpiredDeletions } from '@repo/media';
import {
  deleteObjectsMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { purgeProcessor } from '../../src/crons/purge.cron';
import {
  daysAgo,
  organizationExists,
  requireOrganizationId,
  seedWorkspaceMedia,
  softDeleteOrganizationAt,
  softDeleteUserAt,
  userExists,
} from '../support/purge-fixtures';

describe('purge cron', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('purges organizations and users deleted more than 30 days ago', async () => {
    const expiredOrganizationOwner = await seedAuthenticatedUser();
    const expiredOrganizationId = await requireOrganizationId(expiredOrganizationOwner.userId);
    await softDeleteOrganizationAt({
      organizationId: expiredOrganizationId,
      deletedAt: daysAgo(31),
    });
    const expiredUser = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: expiredUser.userId, deletedAt: daysAgo(31) });

    await purgeProcessor();

    expect(await organizationExists(expiredOrganizationId)).toBe(false);
    expect(await userExists(expiredOrganizationOwner.userId)).toBe(false);
    expect(await userExists(expiredUser.userId)).toBe(false);
  });

  test('keeps organizations and users still inside the recovery window', async () => {
    const recentOrganizationOwner = await seedAuthenticatedUser();
    const recentOrganizationId = await requireOrganizationId(recentOrganizationOwner.userId);
    await softDeleteOrganizationAt({
      organizationId: recentOrganizationId,
      deletedAt: daysAgo(29),
    });
    const recentUser = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: recentUser.userId, deletedAt: daysAgo(29) });
    const activeUser = await seedAuthenticatedUser();

    await purgeProcessor();

    expect(await organizationExists(recentOrganizationId)).toBe(true);
    expect(await userExists(recentOrganizationOwner.userId)).toBe(true);
    expect(await userExists(recentUser.userId)).toBe(true);
    expect(await userExists(activeUser.userId)).toBe(true);
  });

  test('reports how many organizations and users were purged', async () => {
    const organizationOwner = await seedAuthenticatedUser();
    await softDeleteOrganizationAt({
      organizationId: await requireOrganizationId(organizationOwner.userId),
      deletedAt: daysAgo(40),
    });
    const removedUser = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: removedUser.userId, deletedAt: daysAgo(40) });
    const recentUser = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: recentUser.userId, deletedAt: daysAgo(1) });

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 1, usersPurged: 1, failures: 0 });
  });

  test('honors the injected clock for the 30 day cutoff', async () => {
    const removedUser = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: removedUser.userId, deletedAt: daysAgo(10) });
    const inTwentyFiveDays = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);

    const summary = await purgeExpiredDeletions({ now: inTwentyFiveDays });

    expect(summary.usersPurged).toBe(1);
  });

  test('counts a failed R2 cleanup and keeps that user, purging the rest', async () => {
    const failingUser = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: failingUser.userId, deletedAt: daysAgo(31) });
    await seedWorkspaceMedia({
      workspaceId: failingUser.personalWorkspaceId,
      storageKey: 'broken-object.pdf',
    });
    const healthyUser = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: healthyUser.userId, deletedAt: daysAgo(31) });
    deleteObjectsMock.mockImplementation((_bucket, keys) =>
      Promise.resolve({ deleted: [], errors: keys }),
    );

    const summary = await purgeExpiredDeletions();

    expect(summary).toEqual({ organizationsPurged: 0, usersPurged: 1, failures: 1 });
    expect(await userExists(failingUser.userId)).toBe(true);
    expect(await userExists(healthyUser.userId)).toBe(false);
  });

  test('purges only the oldest users up to the batch size', async () => {
    const oldest = await seedAuthenticatedUser();
    const middle = await seedAuthenticatedUser();
    const newest = await seedAuthenticatedUser();
    await softDeleteUserAt({ userId: oldest.userId, deletedAt: daysAgo(50) });
    await softDeleteUserAt({ userId: middle.userId, deletedAt: daysAgo(40) });
    await softDeleteUserAt({ userId: newest.userId, deletedAt: daysAgo(35) });

    const summary = await purgeExpiredDeletions({ batchSize: 2 });

    expect(summary).toEqual({ organizationsPurged: 0, usersPurged: 2, failures: 0 });
    expect(await userExists(oldest.userId)).toBe(false);
    expect(await userExists(middle.userId)).toBe(false);
    expect(await userExists(newest.userId)).toBe(true);
  });

  test('purges only the oldest organizations up to the batch size', async () => {
    const oldestOwner = await seedAuthenticatedUser();
    const newestOwner = await seedAuthenticatedUser();
    const oldestOrganizationId = await requireOrganizationId(oldestOwner.userId);
    const newestOrganizationId = await requireOrganizationId(newestOwner.userId);
    await softDeleteOrganizationAt({
      organizationId: oldestOrganizationId,
      deletedAt: daysAgo(50),
    });
    await softDeleteOrganizationAt({
      organizationId: newestOrganizationId,
      deletedAt: daysAgo(40),
    });

    const summary = await purgeExpiredDeletions({ batchSize: 1 });

    expect(summary.organizationsPurged).toBe(1);
    expect(await organizationExists(oldestOrganizationId)).toBe(false);
    expect(await organizationExists(newestOrganizationId)).toBe(true);
  });
});
