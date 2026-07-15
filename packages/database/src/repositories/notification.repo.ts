import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import type { NewNotification, Notification } from '../schema';
import { notification } from '../schema';

export async function createNotification(payload: NewNotification): Promise<Notification> {
  const [createdNotification] = await db.insert(notification).values(payload).returning();

  if (!createdNotification) {
    throw new Error('Failed to create notification');
  }

  return createdNotification;
}

export async function listNotifications({
  userId,
  limit,
  offset,
}: {
  userId: string;
  limit?: number;
  offset?: number;
}): Promise<Notification[]> {
  return db.query.notification.findMany({
    where: { userId },
    orderBy: (t, { desc }) => desc(t.createdAt),
    limit,
    offset,
  });
}

export async function getUnreadNotificationCount({
  userId,
}: {
  userId: string;
}): Promise<number> {
  return db.$count(
    notification,
    and(eq(notification.userId, userId), isNull(notification.readAt)),
  );
}

export async function markNotificationRead({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<Notification | null> {
  const [updatedNotification] = await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
    .returning();

  return updatedNotification || null;
}

export async function markAllNotificationsRead({
  userId,
}: {
  userId: string;
}): Promise<number> {
  const updatedNotifications = await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)))
    .returning({ id: notification.id });

  return updatedNotifications.length;
}

export async function deleteReadNotificationsOlderThan({
  date,
}: {
  date: Date;
}): Promise<number> {
  const deletedNotifications = await db
    .delete(notification)
    .where(and(isNotNull(notification.readAt), lt(notification.readAt, date)))
    .returning({ id: notification.id });

  return deletedNotifications.length;
}

export async function deleteNotification({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<boolean> {
  const deletedNotifications = await db
    .delete(notification)
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
    .returning({ id: notification.id });

  return deletedNotifications.length > 0;
}

export async function deleteAllNotifications({
  userId,
}: {
  userId: string;
}): Promise<number> {
  const deletedNotifications = await db
    .delete(notification)
    .where(eq(notification.userId, userId))
    .returning({ id: notification.id });

  return deletedNotifications.length;
}
