import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';

export const user = pgTable(
  'users',
  {
    id: primaryIdColumn,
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    role: text('role'),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('user_banned_idx').on(table.banned),
    index('user_emailVerified_idx').on(table.emailVerified),
    index('user_createdAt_idx').on(table.createdAt),
  ],
);

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
