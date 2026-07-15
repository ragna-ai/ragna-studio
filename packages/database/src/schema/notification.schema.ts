import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';
import { user } from './user.schema';

export const notification = pgTable(
  'notifications',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('notifications_userId_idx').on(table.userId),
    index('notifications_userId_readAt_idx').on(table.userId, table.readAt),
  ],
);

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
