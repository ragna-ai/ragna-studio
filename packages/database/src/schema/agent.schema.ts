import { boolean, index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { aiModel, type AiModel } from './aimodel.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

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
    workspaceId: text('workspace_id').references(() => workspace.id, { onDelete: 'set null' }),
    aiModelId: text('ai_model_id')
      .notNull()
      .references(() => aiModel.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    // Background knowledge the agent should always have, kept separate from
    // `systemPrompt` (behavior). Null/empty both mean "no context".
    context: text('context'),
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
    index('agent_workspaceId_idx').on(table.workspaceId),
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
