import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { workspace } from './workspace.schema';

// FOLDER
// Flat grouping for documents within a workspace, no nesting in v1 (see
// docs/documents/prd.md).
export const folder = pgTable(
  'folders',
  {
    id: primaryIdColumn,
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [index('folder_workspaceId_idx').on(table.workspaceId)],
);

export type Folder = typeof folder.$inferSelect;
export type NewFolder = typeof folder.$inferInsert;
