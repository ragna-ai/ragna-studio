import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/create-id';
import { aiModel, type AiModel } from './aimodel.schema';
import { timestamps } from './common.schema';
import { user } from './user.schema';

export interface AgentSettings {
  someSetting?: string;
}

// AGENT
export const agent = sqliteTable(
  'agents',
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
    tools: text('tools', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    settings: text('settings', { mode: 'json' })
      .notNull()
      .$type<AgentSettings>()
      .default(sql`'{}'`),
    ...timestamps,
  },
  (table) => [
    index('agent_userId_idx').on(table.userId),
    index('agent_aiModelId_idx').on(table.aiModelId),
  ],
);

export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;

export type AgentWithAiModel = Agent & { aiModel: AiModel };

export const defaultAgent = sqliteTable(
  'default_agents',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    aiModelId: text('ai_model_id')
      .notNull()
      .references(() => aiModel.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    tools: text('tools', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    settings: text('settings', { mode: 'json' })
      .notNull()
      .$type<AgentSettings>()
      .default(sql`'{}'`),
    ...timestamps,
  },
  (table) => [index('default_agent_aiModelId_idx').on(table.aiModelId)],
);

export type DefaultAgent = typeof defaultAgent.$inferSelect;
