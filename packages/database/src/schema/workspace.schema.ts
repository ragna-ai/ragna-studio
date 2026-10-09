import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { organization } from './organization.schema';
import { user } from './user.schema';

export const workspace = pgTable(
  'workspaces',
  {
    id: primaryIdColumn,
    // Named `ownerId` (not `userId`) to signal one owner now, and to leave room
    // for a future `workspace_users` pivot without renaming this column.
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [
    index('workspace_ownerId_idx').on(table.ownerId),
    index('workspace_organizationId_idx').on(table.organizationId),
  ],
);

export type Workspace = typeof workspace.$inferSelect;
export type NewWorkspace = typeof workspace.$inferInsert;
