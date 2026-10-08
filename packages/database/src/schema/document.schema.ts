import { foreignKey, index, pgTable, text } from 'drizzle-orm/pg-core';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { folder } from './folder.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

// DOCUMENT
// Markdown is the canonical format: agent tools and
// the Tiptap editor both read/write `content` directly, the editor only
// parses/serializes markdown at its own edges.
// Authorship: exactly one of createdByUserId / createdByAgentId is set. No
// separate `role` column, whichever column is non-null identifies the author.
// Both are set null on delete (not cascade): the document is workspace-owned,
// so removing its creator must not take the document with it.
export const document = pgTable(
  'documents',
  {
    id: primaryIdColumn,
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    // Null = root level. Folder delete moves documents to root (the repo
    // clears folderId first), it never deletes them.
    folderId: text('folder_id'),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdByAgentId: text('created_by_agent_id').references(() => agent.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('document_workspaceId_idx').on(table.workspaceId),
    foreignKey({
      columns: [table.workspaceId, table.folderId],
      foreignColumns: [folder.workspaceId, folder.id],
      name: 'documents_folder_workspace_fk',
    }),
  ],
);

export type Document = typeof document.$inferSelect;
export type NewDocument = typeof document.$inferInsert;
