// packages/testing/src/credits/credit-fixtures.ts
import type { AiModelPricing, CreditSettlement, CreditUsageFeature } from '@repo/database';
import {
  createAiModel,
  getOrCreateCreditAccountByUserId,
  grantCredits,
  settleCreditUsage,
} from '@repo/database';
import { assertConnectedToTestDatabase } from '../db/db-guard';

export interface SeedTokenPricedAiModelParams {
  provider?: string;
  model?: string;
  displayName?: string;
  nanoUsdPerInputToken?: number;
  nanoUsdPerOutputToken?: number;
  nanoUsdPerCacheReadToken?: number;
  nanoUsdPerCacheWriteToken?: number;
  /** Per-model markup override. Omit to fall through to config.creditMarkupBps. */
  markupBps?: number;
}

export interface SeedTokenPricedAiModelResult {
  aiModelId: string;
  pricing: Extract<AiModelPricing, { kind: 'token' }>;
}

/**
 * Seeds a minimal `ai_models` row with `kind: 'token'` pricing, the only
 * pricing kind the v1 credit charger implements.
 * `settleCreditUsage` reads `pricing` from a real row inside its
 * transaction, and the credit gates' pricing check
 * needs a real `aiModelId` to pass around, so
 * charging tests can't get away with an in-memory pricing object alone.
 */
export async function seedTokenPricedAiModel(
  params: SeedTokenPricedAiModelParams = {},
): Promise<SeedTokenPricedAiModelResult> {
  await assertConnectedToTestDatabase();

  const pricing: Extract<AiModelPricing, { kind: 'token' }> = {
    kind: 'token',
    nanoUsdPerInputToken: params.nanoUsdPerInputToken ?? 3000,
    nanoUsdPerOutputToken: params.nanoUsdPerOutputToken ?? 15000,
    ...(params.nanoUsdPerCacheReadToken !== undefined && {
      nanoUsdPerCacheReadToken: params.nanoUsdPerCacheReadToken,
    }),
    ...(params.nanoUsdPerCacheWriteToken !== undefined && {
      nanoUsdPerCacheWriteToken: params.nanoUsdPerCacheWriteToken,
    }),
    ...(params.markupBps !== undefined && { markupBps: params.markupBps }),
  };

  const aiModel = await createAiModel({
    provider: params.provider ?? 'anthropic',
    model: params.model ?? `test-model-${crypto.randomUUID()}`,
    modality: 'text',
    family: 'llm',
    size: 'small',
    displayName: params.displayName ?? 'Test Model',
    description: 'Seeded by packages/testing for credit system tests.',
    pricing,
    capabilities: {},
    meta: {},
  });

  return { aiModelId: aiModel.id, pricing };
}

export interface SeedCreditAccountParams {
  userId: string;
  /** Starting balance, funded through a real `grantCredits` ledger entry. Defaults to 0. */
  balanceMicroCredits?: bigint;
}

export interface SeedCreditAccountResult {
  creditAccountId: string;
}

/**
 * Creates (or reuses) a user's credit account and, when a positive balance
 * is requested, tops it up via a real `grantCredits` call rather than
 * poking `balanceMicroCredits` directly, so the ledger row a test relies on
 * for isolation/ordering assertions actually exists. Defaults to a 0
 * balance: the account exists but the gate still refuses, matching
 * `resolveCreditSpendState`'s "no account" vs "zero balance" distinction.
 */
export async function seedCreditAccount(
  params: SeedCreditAccountParams,
): Promise<SeedCreditAccountResult> {
  await assertConnectedToTestDatabase();

  const account = await getOrCreateCreditAccountByUserId({ userId: params.userId });

  const amount = params.balanceMicroCredits ?? 0n;
  if (amount !== 0n) {
    await grantCredits({
      creditAccountId: account.id,
      amountMicroCredits: amount,
      kind: 'grant',
      description: 'Seeded by packages/testing for credit system tests.',
      idempotencyKey: `grant:test-${crypto.randomUUID()}`,
    });
  }

  return { creditAccountId: account.id };
}

export interface SettleTestUsageParams {
  creditAccountId: string;
  workspaceId: string;
  userId: string;
  aiModelId: string;
  billableInputTokens?: number;
  billableOutputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  feature?: CreditUsageFeature;
  idempotencyKey?: string;
}

/**
 * Settles one charge with sane defaults (no cache tokens, `chat` feature, a
 * fresh random idempotency key), for tests that need usage/ledger rows to
 * exist but aren't exercising the charge math itself (that's
 * `computeCharge`, tested directly against its pure inputs). Delegates to
 * the real `settleCreditUsage` so seeded rows go through the same
 * transaction, debit, and ledger write a production charge does.
 */
export async function settleTestUsage(
  params: SettleTestUsageParams,
): Promise<CreditSettlement | null> {
  const billableInputTokens = params.billableInputTokens ?? 1000;
  const billableOutputTokens = params.billableOutputTokens ?? 500;

  return settleCreditUsage({
    creditAccountId: params.creditAccountId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    aiModelId: params.aiModelId,
    feature: params.feature ?? 'chat',
    refType: null,
    refId: null,
    durationMs: null,
    idempotencyKey: params.idempotencyKey ?? `chat:test-${crypto.randomUUID()}`,
    billableInputTokens,
    billableOutputTokens,
    // No cache modeling in this fixture: raw reported tokens equal the
    // billable ones unless a caller overrides cacheReadTokens/cacheWriteTokens.
    inputTokens: billableInputTokens,
    outputTokens: billableOutputTokens,
    reasoningTokens: 0,
    cacheReadTokens: params.cacheReadTokens ?? 0,
    cacheWriteTokens: params.cacheWriteTokens ?? 0,
  });
}
