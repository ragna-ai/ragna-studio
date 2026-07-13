import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';

export const verification = pgTable(
  'verifications',
  {
    id: primaryIdColumn,
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);
