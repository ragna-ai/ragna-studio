import { index, integer, pgTable, text, vector } from 'drizzle-orm/pg-core';
import { agentContextDocument } from './agent-context-document.schema';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';

// AGENT CONTEXT DOCUMENT CHUNK
// Retrieval unit for Phase 3 (docs/agent/agent-context-retrieval.md). One row
// per chunk of a document's extracted text, embedded for cosine search.
// `agentId` is denormalized from the document so search can filter on one
// column without a join through agent_context_documents. No vector index:
// search always scopes to a single agent's chunks, so an exact scan is fast
// enough without ANN tuning (see the PRD's "Design decisions").
export const agentContextDocumentChunk = pgTable(
  'agent_context_document_chunks',
  {
    id: primaryIdColumn,
    documentId: text('document_id')
      .notNull()
      .references(() => agentContextDocument.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    ...timestamps,
  },
  (table) => [index('agentContextDocumentChunk_agentId_idx').on(table.agentId)],
);

export type AgentContextDocumentChunk = typeof agentContextDocumentChunk.$inferSelect;
export type NewAgentContextDocumentChunk = typeof agentContextDocumentChunk.$inferInsert;
