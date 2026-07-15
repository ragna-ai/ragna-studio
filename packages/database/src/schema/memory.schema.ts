import { pgTable, text } from 'drizzle-orm/pg-core';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';

// AGENT MEMORY
// One row per agent: a single markdown document the agent reads and edits
// via the `memory` tool. No row-per-fact; retrieval is "inject the whole
// document" until Phase 2 adds chunking + embeddings.
export const agentMemory = pgTable('agent_memories', {
  id: primaryIdColumn,
  agentId: text('agent_id')
    .notNull()
    .unique()
    .references(() => agent.id, { onDelete: 'cascade' }),
  content: text('content').notNull().default(''), // markdown, agent-managed
  ...timestamps,
});

export type AgentMemory = typeof agentMemory.$inferSelect;
export type NewAgentMemory = typeof agentMemory.$inferInsert;
