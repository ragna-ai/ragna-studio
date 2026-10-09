import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { aiModel, type AiModel } from './aimodel.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { dataset } from './dataset.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

// AI SDK's unified reasoning-effort levels (ai-sdk.dev/docs/ai-sdk-core/reasoning),
// trimmed to the levels worth exposing in the UI. Each provider adapter maps
// these onto its own mechanism (Anthropic thinking budget, OpenAI
// reasoningEffort, Google thinkingConfig). 'none' is included and distinct
// from unset/null: 'none' is sent to the provider to explicitly turn
// reasoning off (needed for models that reason by default), while
// unset/null sends nothing and leaves the choice to the provider.
export const agentReasoningEffortValues = ['none', 'low', 'medium', 'high'] as const;
export type AgentReasoningEffort = (typeof agentReasoningEffortValues)[number];

export interface AgentSettings {
  temperature?: number | null;
  maxOutputTokens?: number | null;
  // Unset/null: no reasoning param sent, so the provider's own default
  // applies. Set to 'none' to explicitly disable reasoning instead.
  reasoning?: AgentReasoningEffort | null;
}

// Single source of truth for the enum: drizzle-orm/zod can't derive a
// column's `.$type<T>()` for jsonb columns (it only knows the storage is
// JSON), so `packages/database/src/zod/index.ts` refines the `tools` field
// with a zod schema built from this array.
export const agentToolValues = [
  'think',
  'webSearch',
  'webBrowser',
  'imageGen',
  'videoGen',
  'linkedinDraft',
  'memory',
  'datasets',
  'documents',
  'tasks',
] as const;
export type AgentTool = (typeof agentToolValues)[number];
export type AgentTools = AgentTool[];

// No default temperature: Anthropic is deprecating the parameter, so new
// agents send nothing to the provider unless a user explicitly sets one via
// the Settings tab slider (0 there means "disabled" and is normalized away
// before it's ever persisted, see agent.controller.ts).
const defaultAgentSettings: AgentSettings = {
  temperature: undefined,
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
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
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
    // Soft pin: when set, the dataset's id and
    // schema are injected into this agent's instructions so it can skip
    // `datasetFind` and go straight to row operations. Deleting the dataset
    // nulls this out (the repo clears it first) and the agent degrades to lookup mode.
    defaultDatasetId: text('default_dataset_id'),
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
    index('agent_defaultDatasetId_idx').on(table.defaultDatasetId),
    unique('agents_workspace_id_unique').on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.defaultDatasetId],
      foreignColumns: [dataset.workspaceId, dataset.id],
      name: 'agents_default_dataset_workspace_fk',
    }),
    uniqueIndex('agent_default_workspace_idx')
      .on(table.workspaceId)
      .where(sql`${table.isDefault}`),
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
