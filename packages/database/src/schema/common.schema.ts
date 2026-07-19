import { createPrimaryId } from '@repo/utils';
import { text, timestamp } from 'drizzle-orm/pg-core';

export const primaryIdColumn = text('id').$defaultFn(createPrimaryId).primaryKey();

export const timestamps = {
  createdAt: timestamp('created_at', { precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { precision: 3 })
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { precision: 3 }),
};
