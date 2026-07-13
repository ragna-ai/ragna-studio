import { text, timestamp } from 'drizzle-orm/pg-core';
import { createId } from '../utils/create-id';

export const primaryIdColumn = text('id').$defaultFn(createId).primaryKey();

export const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
};
