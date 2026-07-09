import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { aiModel } from './aimodel.schema';
import { timestamps } from './common.schema';
import { user } from './user.schema';

// ASSISTANT
export const assistant = sqliteTable(
  'assistants',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    aiModelId: text('ai_model_id')
      .notNull()
      .references(() => aiModel.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    tools: text('tools').notNull().default('[]'), //.$type<AssistantTools>(),
    settings: text('settings', { mode: 'json' }).notNull().default('{}'), //.$type<AssistantSettings>(),
    ...timestamps,
  },
  (table) => [
    index('assistant_userId_idx').on(table.userId),
    index('assistant_aiModelId_idx').on(table.aiModelId),
  ],
);

export type Assistant = typeof assistant.$inferSelect;
export type NewAssistant = typeof assistant.$inferInsert;
