import { boolean, index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { aiModel, type AiModel } from './aimodel.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';

export interface AgentSettings {
  temperature?: number;
  maxOutputTokens?: number;
}

export type AgentTool =
  | 'think'
  | 'webSearch'
  | 'webBrowser'
  | 'imageGen'
  | 'linkedinDraft'
  | 'memory';
export type AgentTools = AgentTool[];

const defaultAgentSettings: AgentSettings = {
  temperature: 0.7,
  maxOutputTokens: undefined,
};

export const getDefaultAgentSettings = (): AgentSettings => {
  return { ...defaultAgentSettings };
};

export const getDefaultAgentSettingsJson = (): string => {
  return JSON.stringify(getDefaultAgentSettings());
};

// AGENT
export const agent = pgTable(
  'agents',
  {
    id: primaryIdColumn,
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    aiModelId: text('ai_model_id')
      .notNull()
      .references(() => aiModel.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    tools: jsonb('tools').notNull().$type<AgentTools>().default([]),
    settings: jsonb('settings')
      .notNull()
      .$type<AgentSettings>()
      .$defaultFn(() => getDefaultAgentSettings()),
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

export const agentTemplate = pgTable(
  'agent_templates',
  {
    id: primaryIdColumn,
    aiModelId: text('ai_model_id')
      .notNull()
      .references(() => aiModel.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    tools: jsonb('tools').notNull().$type<AgentTools>().default([]),
    settings: jsonb('settings')
      .notNull()
      .$type<AgentSettings>()
      .$defaultFn(() => getDefaultAgentSettings()),
    ...timestamps,
  },
  (table) => [index('agent_template_aiModelId_idx').on(table.aiModelId)],
);

export type AgentTemplate = typeof agentTemplate.$inferSelect;
