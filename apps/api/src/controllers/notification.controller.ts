import {
  deleteAllNotifications,
  deleteNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validNotificationIdParam, validPaginationQuery } from '../validation';

export const notificationController = new Hono()
  .basePath('/notification')
  .use(authMiddleware)
  /**
   * [GET] /notification
   * Get paginated notifications for the authenticated user
   */
  .get('/', validPaginationQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;

    // Calculate offset for pagination ((page number - 1) * page size)
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Get unread count and fail gracefully
    const { data: unreadCount } = await tryCatch(() =>
      getUnreadNotificationCount({ userId: user.id }),
    );

    const { error, data: notifications } = await tryCatch(() =>
      listNotifications({ userId: user.id, limit, offset }),
    );

    if (error !== null) {
      logger.error('Failed to get notifications for user', error);
      throw new InternalServerErrorException('Failed to get notifications for user');
    }

    return c.json({ notifications, count: unreadCount || 0 });
  })
  /**
   * [GET] /notification/unread-count
   * Get the unread notification count for the authenticated user
   */
  .get('/unread-count', async (c) => {
    const user = c.get('user');

    const { error, data: count } = await tryCatch(() =>
      getUnreadNotificationCount({ userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get unread notification count', error);
      throw new InternalServerErrorException('Failed to get unread notification count');
    }

    return c.json({ count });
  })
  /**
   * [PATCH] /notification/read-all
   * Mark all notifications as read for the authenticated user
   */
  .patch('/read-all', async (c) => {
    const user = c.get('user');

    const { error, data: count } = await tryCatch(() =>
      markAllNotificationsRead({ userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to mark all notifications as read', error);
      throw new InternalServerErrorException('Failed to mark all notifications as read');
    }

    return c.json({ count });
  })
  /**
   * [PATCH] /notification/:id/read
   * Mark a single notification as read
   */
  .patch('/:id/read', validNotificationIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: notification } = await tryCatch(() =>
      markNotificationRead({ id: param.id, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to mark notification as read', error);
      throw new InternalServerErrorException('Failed to mark notification as read');
    }

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return c.json({ notification });
  })
  /**
   * [DELETE] /notification
   * Delete all notifications for the authenticated user
   */
  .delete('/', async (c) => {
    const user = c.get('user');

    const { error, data: count } = await tryCatch(() =>
      deleteAllNotifications({ userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to delete all notifications', error);
      throw new InternalServerErrorException('Failed to delete all notifications');
    }

    return c.json({ count });
  })
  /**
   * [DELETE] /notification/:id
   * Delete a single notification
   */
  .delete('/:id', validNotificationIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: deleted } = await tryCatch(() =>
      deleteNotification({ id: param.id, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to delete notification', error);
      throw new InternalServerErrorException('Failed to delete notification');
    }

    if (!deleted) {
      throw new NotFoundException('Notification not found');
    }

    return c.json({ success: true });
  });
