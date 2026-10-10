import * as database from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { cleanupProcessor } from '../../src/crons/cleanup.cron';
import {
  daysFromNow,
  hoursAgo,
  listNotificationIds,
  listSessionIds,
  listVerificationIds,
  seedNotification,
  seedSession,
  seedVerification,
} from '../support/crons-fixtures';
import { daysAgo } from '../support/purge-fixtures';

describe('cleanup cron', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  afterEach(() => {
    mock.restore();
  });

  test('removes expired sessions and keeps live ones', async () => {
    const { userId } = await seedAuthenticatedUser();
    const expiredId = await seedSession({ userId, expiresAt: hoursAgo(1) });
    const liveId = await seedSession({ userId, expiresAt: daysFromNow(1) });

    await cleanupProcessor();

    const remaining = await listSessionIds();
    expect(remaining.has(expiredId)).toBe(false);
    expect(remaining.has(liveId)).toBe(true);
  });

  test('removes expired verifications and keeps live ones', async () => {
    const expiredId = await seedVerification({ expiresAt: hoursAgo(1) });
    const liveId = await seedVerification({ expiresAt: daysFromNow(1) });

    await cleanupProcessor();

    const remaining = await listVerificationIds();
    expect(remaining.has(expiredId)).toBe(false);
    expect(remaining.has(liveId)).toBe(true);
  });

  test('removes notifications read over 30 days ago and keeps the rest', async () => {
    const { userId } = await seedAuthenticatedUser();
    const oldReadId = await seedNotification({ userId, readAt: daysAgo(31) });
    const recentReadId = await seedNotification({ userId, readAt: daysAgo(29) });
    const unreadId = await seedNotification({ userId, readAt: null });

    await cleanupProcessor();

    const remaining = await listNotificationIds();
    expect(remaining.has(oldReadId)).toBe(false);
    expect(remaining.has(recentReadId)).toBe(true);
    expect(remaining.has(unreadId)).toBe(true);
  });

  test('one failing step does not skip the others', async () => {
    const expiredVerificationId = await seedVerification({ expiresAt: hoursAgo(1) });
    const failingStep = spyOn(database, 'deleteExpiredSessions').mockRejectedValue(
      new Error('db down'),
    );

    await cleanupProcessor();

    expect(failingStep).toHaveBeenCalled();
    const remaining = await listVerificationIds();
    expect(remaining.has(expiredVerificationId)).toBe(false);
  });
});
