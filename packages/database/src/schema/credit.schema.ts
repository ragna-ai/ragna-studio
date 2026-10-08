import { bigint, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import type { AiModelPricing } from './aimodel.schema';
import { aiModel } from './aimodel.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export const creditLedgerKinds = ['grant', 'usage', 'refund', 'adjustment'] as const;
export type CreditLedgerKind = (typeof creditLedgerKinds)[number];

export const creditUsageFeatures = ['chat', 'workflow', 'team'] as const;
export type CreditUsageFeature = (typeof creditUsageFeatures)[number];

// CREDIT ACCOUNT
// The balance holder. One per user
// in v1: `userId` is unique, so this is a 1:1 extension of `users` today.
// When organisations land, add a nullable `organisationId` FK alongside
// `userId` (plus a check that exactly one is set) and repoint resolution;
// the ledger and usage history never need to change their
// `creditAccountId` reference.
export const creditAccount = pgTable('credit_accounts', {
  id: primaryIdColumn,
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Denormalised cache of sum(credit_ledger.amount_micro_credits). The
  // ledger is the source of truth; this column exists so the spend gate is
  // one indexed read instead of an aggregate over an ever-growing table. May
  // go negative.
  balanceMicroCredits: bigint('balance_micro_credits', { mode: 'bigint' }).notNull().default(0n),
  ...timestamps,
});

export type CreditAccount = typeof creditAccount.$inferSelect;
export type NewCreditAccount = typeof creditAccount.$inferInsert;

// CREDIT USAGE EVENT
// The audit trail: one row per charged LLM run.
// `provider` / `model` / `modelDisplayName` are denormalised so a
// historical charge renders the same after the model row is renamed or
// deleted. This is a correctness rule, not an optimisation:
// `listCreditUsageEvents` deliberately never joins `ai_models` for display.
export const creditUsageEvent = pgTable(
  'credit_usage_events',
  {
    id: primaryIdColumn,
    creditAccountId: text('credit_account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    // Who ran it, for per-member breakdowns once organisations exist.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    aiModelId: text('ai_model_id').references(() => aiModel.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    modelDisplayName: text('model_display_name').notNull(),
    feature: text('feature').notNull().$type<CreditUsageFeature>(),
    // Not an FK, deliberately loose so history survives the referenced
    // entity's deletion, e.g. `refType: 'chat'`, `refId: <chat.id>`.
    refType: text('ref_type'),
    refId: text('ref_id'),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    // Already included in outputTokens; recorded for breakdown only, never
    // added on top. Adding it would double-charge every thinking model.
    reasoningTokens: integer('reasoning_tokens'),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    // After normalizeUsage (@repo/ai): this is what was actually charged.
    billableInputTokens: integer('billable_input_tokens').notNull(),
    billableOutputTokens: integer('billable_output_tokens').notNull(),
    // Snapshot of the `ai_models.pricing` object in effect when this run was
    // charged, so a later price change never rewrites history.
    unitPrices: jsonb('unit_prices').notNull().$type<AiModelPricing>(),
    markupBps: integer('markup_bps').notNull(),
    costNanoUsd: bigint('cost_nano_usd', { mode: 'bigint' }).notNull(),
    actualCostNanoUsd: bigint('actual_cost_nano_usd', { mode: 'bigint' }).notNull(),
    chargedMicroCredits: bigint('charged_micro_credits', { mode: 'bigint' }).notNull(),
    durationMs: integer('duration_ms'),
    ...timestamps,
  },
  (table) => [
    index('creditUsageEvent_creditAccountId_idx').on(table.creditAccountId),
    index('creditUsageEvent_workspaceId_idx').on(table.workspaceId),
  ],
);

export type CreditUsageEvent = typeof creditUsageEvent.$inferSelect;
export type NewCreditUsageEvent = typeof creditUsageEvent.$inferInsert;

// CREDIT LEDGER
// Append-only: rows are never updated or deleted.
// `balanceAfterMicroCredits` is stored rather than derived so the
// history reads without a window function and a corrupted balance is easy
// to spot.
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: primaryIdColumn,
    creditAccountId: text('credit_account_id')
      .notNull()
      .references(() => creditAccount.id, { onDelete: 'cascade' }),
    // Negative for `usage`, positive for `grant` / `refund`.
    amountMicroCredits: bigint('amount_micro_credits', { mode: 'bigint' }).notNull(),
    kind: text('kind').notNull().$type<CreditLedgerKind>(),
    // Lets a ledger row be traced to its detail when debugging; not used to
    // power any list view (those query the ledger or the usage events
    // directly, never join between them).
    usageEventId: text('usage_event_id').references(() => creditUsageEvent.id, {
      onDelete: 'set null',
    }),
    // Double-charge guard. Format `<feature>:<callId>`, e.g. `chat:abc123`;
    // manual grants use `grant:<uuid>`. A unique-violation on insert means
    // the charge already landed and is swallowed, not retried.
    idempotencyKey: text('idempotency_key').notNull().unique(),
    balanceAfterMicroCredits: bigint('balance_after_micro_credits', {
      mode: 'bigint',
    }).notNull(),
    description: text('description'),
    ...timestamps,
  },
  (table) => [
    // History endpoint: rows for one account, newest first.
    index('creditLedger_creditAccountId_createdAt_idx').on(table.creditAccountId, table.createdAt),
  ],
);

export type CreditLedger = typeof creditLedger.$inferSelect;
export type NewCreditLedger = typeof creditLedger.$inferInsert;
