import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';
import { user } from './user.schema';

export const session = pgTable(
  'sessions',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    impersonatedBy: text('impersonated_by'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);
