import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timestamps } from './common.schema';

// AI MODEL
// export const aiModelType = pgEnum('ai_model_type', ['llm', 'image', 'video', 'audio']);

export const aiModel = sqliteTable('ai_models', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description').notNull(),
  capabilities: text('capabilities', { mode: 'json' }),
  meta: text('meta', { mode: 'json' }),
  ...timestamps,
});

export type AiModel = typeof aiModel.$inferSelect;
export type NewAiModel = typeof aiModel.$inferInsert;
