import {
  type AnyPgColumn,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { aiModel, type AiModel } from './aimodel.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { dataset } from './dataset.schema';
import { media } from './media.schema';
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

/** Shape only. Ids and access are validated in @repo/ai (agentToolGrantsSchema). */
export interface StoredAgentToolGrant {
  id: string;
  access?: string;
}

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
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    // Background knowledge the agent should always have, kept separate from
    // `systemPrompt` (behavior). Null/empty both mean "no context".
    context: text('context'),
    toolGrants: jsonb('tool_grants').notNull().$type<StoredAgentToolGrant[]>().default([]),
    // Soft pin: when set, the dataset's id and
    // schema are injected into this agent's instructions so it can skip
    // `datasetFind` and go straight to row operations. Deleting the dataset
    // nulls this out (the repo clears it first) and the agent degrades to lookup mode.
    defaultDatasetId: text('default_dataset_id'),
    // Mark: an icon name and a tone from @repo/ai's agent-mark lists, validated at the API.
    // Null means "derived from the agent id" in the web app.
    icon: text('icon'),
    tone: text('tone'),
    // Uploaded image that replaces the icon. Cleared (not cascaded) when the media row goes.
    imageMediaId: text('image_media_id').references(() => media.id, { onDelete: 'set null' }),
    settings: jsonb('settings')
      .notNull()
      .$type<AgentSettings>()
      .$defaultFn(() => getDefaultAgentSettings()),
    // The agent_versions row the agent is locked to. Null means unlocked.
    lockedVersionId: text('locked_version_id'),
    ...timestamps,
  },
  (table) => [
    index('agent_userId_idx').on(table.userId),
    index('agent_aiModelId_idx').on(table.aiModelId),
    index('agent_workspaceId_idx').on(table.workspaceId),
    index('agent_defaultDatasetId_idx').on(table.defaultDatasetId),
    index('agent_imageMediaId_idx').on(table.imageMediaId),
    unique('agents_workspace_id_unique').on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.defaultDatasetId],
      foreignColumns: [dataset.workspaceId, dataset.id],
      name: 'agents_default_dataset_workspace_fk',
    }),
    foreignKey({
      columns: [table.workspaceId, table.lockedVersionId],
      foreignColumns: [agentVersion.workspaceId, agentVersion.id],
      name: 'agents_locked_version_workspace_fk',
    }),
  ],
);

export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;

/**
 * The agent fields a lock freezes. Written out instead of picked from `Agent`: `agentVersion`
 * refers to this type, and `Agent` refers to `agentVersion`.
 */
export interface AgentVersionConfig {
  aiModelId: string;
  systemPrompt: string;
  context: string | null;
  toolGrants: StoredAgentToolGrant[];
  defaultDatasetId: string | null;
  settings: AgentSettings;
}

// AGENT VERSION
// One row per lock or approval. `config` and `knowledgeDocumentIds` never change after insert.
// Each pair of history columns is written once and never cleared.
export const agentVersion = pgTable(
  'agent_versions',
  {
    id: primaryIdColumn,
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    // Nulled when the agent goes, so the version outlives its agent. The return type breaks the
    // type cycle between `agent` and `agentVersion`.
    agentId: text('agent_id').references((): AnyPgColumn => agent.id, { onDelete: 'set null' }),
    versionNumber: integer('version_number').notNull(),
    config: jsonb('config').notNull().$type<AgentVersionConfig>(),
    // No FK: a knowledge file may be deleted after an unlock.
    knowledgeDocumentIds: text('knowledge_document_ids').array().notNull(),
    lockedByUserId: text('locked_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    lockedAt: timestamp('locked_at', { precision: 3 }).notNull(),
    approvedByUserId: text('approved_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { precision: 3 }),
    revokedByUserId: text('revoked_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { precision: 3 }),
    unlockedByUserId: text('unlocked_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    unlockedAt: timestamp('unlocked_at', { precision: 3 }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index('agentVersion_workspaceId_idx').on(table.workspaceId),
    uniqueIndex('agentVersion_agentId_versionNumber_idx').on(table.agentId, table.versionNumber),
    unique('agent_versions_workspace_id_unique').on(table.workspaceId, table.id),
  ],
);

export type AgentVersion = typeof agentVersion.$inferSelect;
export type NewAgentVersion = typeof agentVersion.$inferInsert;

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
    toolGrants: jsonb('tool_grants').notNull().$type<StoredAgentToolGrant[]>().default([]),
    settings: jsonb('settings')
      .notNull()
      .$type<AgentSettings>()
      .$defaultFn(() => getDefaultAgentSettings()),
    ...timestamps,
  },
  (table) => [index('agent_template_aiModelId_idx').on(table.aiModelId)],
);

export type AgentTemplate = typeof agentTemplate.$inferSelect;
