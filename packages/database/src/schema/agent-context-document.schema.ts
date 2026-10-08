import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';

export type AgentContextDocumentStatus = 'pending' | 'ready' | 'failed';

// AGENT CONTEXT DOCUMENT
// One row per uploaded document, hard-tied to a single agent (no pool, no
// sharing). Replacing the file re-uses
// the same row: `storageKey` changes, `status` goes back to 'pending', and
// the worker re-extracts under the same id.
export const agentContextDocument = pgTable(
  'agent_context_documents',
  {
    id: primaryIdColumn,
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    status: text('status').notNull().$type<AgentContextDocumentStatus>().default('pending'),
    extractedText: text('extracted_text'),
    isTruncated: boolean('is_truncated').notNull().default(false),
    errorMessage: text('error_message'),
    ...timestamps,
  },
  (table) => [index('agentContextDocument_agentId_idx').on(table.agentId)],
);

export type AgentContextDocument = typeof agentContextDocument.$inferSelect;
export type NewAgentContextDocument = typeof agentContextDocument.$inferInsert;
