import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/create-id';
import { aiModel, type AiModel } from './aimodel.schema';
import { timestamps } from './common.schema';
import { user } from './user.schema';

// ASSISTANT
export const assistant = sqliteTable(
  'assistants',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    aiModelId: text('ai_model_id')
      .notNull()
      .references(() => aiModel.id, { onDelete: 'cascade' }),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
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

export type AssistantWithAiModel = Assistant & { aiModel: AiModel };

export const defaultAssistant = sqliteTable(
  'default_assistants',
  {
    id: text('id').primaryKey().$defaultFn(createId),
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
  (table) => [index('default_assistant_aiModelId_idx').on(table.aiModelId)],
);

export type DefaultAssistant = typeof defaultAssistant.$inferSelect;
