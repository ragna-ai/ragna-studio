import type { NewNotification } from '@repo/database';
import { createNotification } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// /notification: plain user-scoped routes.
// Auth/authorization are covered exhaustively in test/auth/;
// this file only checks the notification feature's own behavior.
//
// There is no POST /notification: notifications are only ever created by
// other flows (task reminders, mentions, etc.), never through this
// controller, so fixture rows are seeded directly via the repo's
// `createNotification`.

const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  count: z.number(),
});
const notificationResponseSchema = z.object({ notification: notificationSchema });
const countResponseSchema = z.object({ count: z.number() });

function seedNotification(userId: string, overrides: Partial<NewNotification> = {}) {
  return createNotification({
    userId,
    type: 'test_notification',
    data: {},
    ...overrides,
  });
}

describe('GET /notification', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new user', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/notification', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = notificationListResponseSchema.parse(await response.json());
    expect(body.notifications).toEqual([]);
    expect(body.count).toBe(0);
  });

  test('lists seeded notifications and paginates', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedNotification(userId, { type: 'first' });
    await seedNotification(userId, { type: 'second' });

    const response = await app.request('/notification?limit=1', {
      headers: { cookie: cookieHeader },
    });

    const body = notificationListResponseSchema.parse(await response.json());
    expect(body.notifications).toHaveLength(1);
  });

  test('rejects an unauthenticated request', async () => {
    const response = await app.request('/notification');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('GET /notification/unread-count', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('counts only unread notifications', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedNotification(userId);
    await seedNotification(userId);
    await seedNotification(userId, { readAt: new Date() });

    const response = await app.request('/notification/unread-count', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = countResponseSchema.parse(await response.json());
    expect(body.count).toBe(2);
  });
});

describe('PATCH /notification/read-all', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('marks every unread notification as read', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedNotification(userId);
    await seedNotification(userId);
    await seedNotification(userId, { readAt: new Date() });

    const response = await app.request('/notification/read-all', {
      method: 'PATCH',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = countResponseSchema.parse(await response.json());
    expect(body.count).toBe(2);

    const unreadResponse = await app.request('/notification/unread-count', {
      headers: { cookie: cookieHeader },
    });
    expect(countResponseSchema.parse(await unreadResponse.json()).count).toBe(0);
  });
});

describe('PATCH /notification/:id/read', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('marks a single notification as read and drops the unread count', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const notification = await seedNotification(userId);

    const response = await app.request(`/notification/${notification.id}/read`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = notificationResponseSchema.parse(await response.json());
    expect(body.notification.readAt).not.toBeNull();

    const unreadResponse = await app.request('/notification/unread-count', {
      headers: { cookie: cookieHeader },
    });
    expect(countResponseSchema.parse(await unreadResponse.json()).count).toBe(0);
  });

  test("404s for another user's notification", async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const notification = await seedNotification(owner.userId);

    const response = await app.request(`/notification/${notification.id}/read`, {
      method: 'PATCH',
      headers: { cookie: other.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /notification/:id', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('removes the notification from the list', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const notification = await seedNotification(userId);

    const deleteResponse = await app.request(`/notification/${notification.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request('/notification', {
      headers: { cookie: cookieHeader },
    });
    const body = notificationListResponseSchema.parse(await listResponse.json());
    expect(body.notifications).toEqual([]);
  });

  test('404s for a notification id that does not exist', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const notification = await seedNotification(userId);
    await app.request(`/notification/${notification.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/notification/${notification.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /notification', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('deletes every notification for the user, read or unread, leaving other users untouched', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    await seedNotification(userA.userId, { readAt: new Date() });
    await seedNotification(userA.userId);
    await seedNotification(userB.userId);

    const response = await app.request('/notification', {
      method: 'DELETE',
      headers: { cookie: userA.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = countResponseSchema.parse(await response.json());
    expect(body.count).toBe(2);

    const listResponse = await app.request('/notification', {
      headers: { cookie: userA.cookieHeader },
    });
    expect(notificationListResponseSchema.parse(await listResponse.json()).notifications).toEqual(
      [],
    );

    const otherListResponse = await app.request('/notification', {
      headers: { cookie: userB.cookieHeader },
    });
    expect(
      notificationListResponseSchema.parse(await otherListResponse.json()).notifications,
    ).toHaveLength(1);
  });
});
