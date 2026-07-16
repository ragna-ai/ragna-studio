import { createPrimaryId } from '@repo/utils';
import { text, timestamp } from 'drizzle-orm/pg-core';

export const primaryIdColumn = text('id').$defaultFn(createPrimaryId).primaryKey();

export const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
};
