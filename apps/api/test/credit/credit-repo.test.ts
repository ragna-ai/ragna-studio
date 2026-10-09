import { config } from '@repo/config';
import {
  ceilDiv,
  computeCharge,
  createAiModel,
  getCreditSpendStateForOrganization,
  getOrCreateCreditAccountByOrganizationId,
  getOrganizationIdByUserId,
  grantCredits,
  resolveCreditSpendState,
  settleCreditUsage,
  db,
} from '@repo/database';
import { member } from '@repo/database/schema';
import {
  seedAuthenticatedUser,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

async function getSpendStateForUser(userId: string) {
  const organizationId = await getOrganizationIdByUserId({ userId });
  if (!organizationId) {
    throw new Error(`user ${userId} has no organization`);
  }
  return getCreditSpendStateForOrganization({ organizationId });
}

// Pure math: computeCharge and ceilDiv (packages/database/src/repositories/
// credit.repo.ts), module-private in production and exported only for
// tests.
describe('ceilDiv', () => {
  test('rounds up on inexact division, always in the platform favour', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(1n, 1_000_000n)).toBe(1n);
    expect(ceilDiv(0n, 5n)).toBe(0n);
  });
});

describe('computeCharge', () => {
  const pricing = {
    kind: 'token' as const,
    nanoUsdPerInputToken: 3000,
    nanoUsdPerOutputToken: 15000,
  };

  test('costNanoUsd is exact: billableInput * inRate + billableOutput * outRate', () => {
    const charge = computeCharge({
      pricing,
      billableInputTokens: 3000,
      billableOutputTokens: 800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    // 9,000,000 + 12,000,000 nanoUSD.
    expect(charge.costNanoUsd).toBe(21_000_000n);
  });

  // Regression: CREDIT_MARKUP_BPS parsing silently swallowed bad values. Fixed in
  // packages/config/src/services/config.service.ts (commit 651c7d2): a
  // "NULL" env value now disables markup, normalizing to exactly 10_000 bps
  // (1.0x, cost price) rather than falling back to the 15_000 default. The
  // test process pins CREDIT_MARKUP_BPS="NULL" (root .env.testing)
  // precisely so this is the state under test.
  test('falls back to config.creditMarkupBps (pinned "NULL"/disabled) when pricing has no override', () => {
    expect(config.creditMarkupBps).toBe(10_000);

    const charge = computeCharge({
      pricing,
      billableInputTokens: 3000,
      billableOutputTokens: 800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    expect(charge.markupBps).toBe(10_000);
    // 1.0x markup: charged credits equal the raw cost exactly, no rounding.
    expect(charge.chargedMicroCredits).toBe(charge.costNanoUsd);
  });

  test('a per-model markupBps overrides the global config value', () => {
    const charge = computeCharge({
      pricing: { ...pricing, markupBps: 15_000 },
      billableInputTokens: 3000,
      billableOutputTokens: 800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    expect(charge.markupBps).toBe(15_000);
    // 31.5 credits.
    expect(charge.chargedMicroCredits).toBe(31_500_000n);
  });

  test('rounds the charge up, never down, when the markup does not divide evenly', () => {
    const charge = computeCharge({
      pricing: { ...pricing, markupBps: 15_001 },
      billableInputTokens: 1,
      billableOutputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    // costNanoUsd = 3000; 3000 * 15001 / 10000 = 4500.3 -> ceil to 4501.
    expect(charge.costNanoUsd).toBe(3000n);
    expect(charge.chargedMicroCredits).toBe(4501n);
  });

  test('actualCostNanoUsd prices cache reads/writes separately and never affects what is charged', () => {
    const cachedPricing = {
      ...pricing,
      nanoUsdPerCacheReadToken: 300,
      nanoUsdPerCacheWriteToken: 3750,
      markupBps: 10_000,
    };

    const charge = computeCharge({
      pricing: cachedPricing,
      billableInputTokens: 1000,
      billableOutputTokens: 0,
      cacheReadTokens: 400,
      cacheWriteTokens: 100,
    });

    // Charged as if nothing were cached.
    expect(charge.costNanoUsd).toBe(3_000_000n); // 1000 * 3000
    expect(charge.chargedMicroCredits).toBe(3_000_000n);

    // uncachedInput = 1000 - 400 - 100 = 500
    // actual = 500*3000 + 400*300 + 100*3750 = 1,500,000 + 120,000 + 375,000
    expect(charge.actualCostNanoUsd).toBe(1_995_000n);
  });
});

describe('settleCreditUsage', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('debits the account and returns the resulting balance', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 100_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();

    const settlement = await settleCreditUsage({
      creditAccountId,
      workspaceId,
      userId,
      aiModelId,
      feature: 'chat',
      refType: null,
      refId: null,
      durationMs: 120,
      idempotencyKey: `chat:test-${crypto.randomUUID()}`,
      billableInputTokens: 3000,
      billableOutputTokens: 800,
      inputTokens: 3000,
      outputTokens: 800,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    expect(settlement).not.toBeNull();
    // Markup disabled for this process (see computeCharge tests above).
    expect(settlement?.chargedMicroCredits).toBe(21_000_000n);
    expect(settlement?.balanceAfterMicroCredits).toBe(100_000_000n - 21_000_000n);

    const spendState = await getSpendStateForUser(userId);
    expect(spendState?.balanceMicroCredits).toBe(100_000_000n - 21_000_000n);
  });

  test('allows the balance to go negative (overdraft) instead of rejecting the charge', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 1_000_000n, // 1 credit: far less than the charge below.
    });
    const { aiModelId } = await seedTokenPricedAiModel();

    const settlement = await settleCreditUsage({
      creditAccountId,
      workspaceId,
      userId,
      aiModelId,
      feature: 'chat',
      refType: null,
      refId: null,
      durationMs: null,
      idempotencyKey: `chat:test-${crypto.randomUUID()}`,
      billableInputTokens: 3000,
      billableOutputTokens: 800,
      inputTokens: 3000,
      outputTokens: 800,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    expect(settlement).not.toBeNull();
    expect(settlement?.balanceAfterMicroCredits).toBeLessThan(0n);

    // Overdraft: the *next* request is refused.
    const spendState = await resolveCreditSpendState({ workspaceId });
    expect(spendState?.allowed).toBe(false);
  });

  test('is idempotent: a retried settlement with the same idempotencyKey does not double-charge', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 100_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();
    const idempotencyKey = `chat:test-${crypto.randomUUID()}`;
    const params = {
      creditAccountId,
      workspaceId,
      userId,
      aiModelId,
      feature: 'chat' as const,
      refType: null,
      refId: null,
      durationMs: null,
      idempotencyKey,
      billableInputTokens: 3000,
      billableOutputTokens: 800,
      inputTokens: 3000,
      outputTokens: 800,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    const first = await settleCreditUsage(params);
    const second = await settleCreditUsage(params);

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const spendState = await getSpendStateForUser(userId);
    expect(spendState?.balanceMicroCredits).toBe(100_000_000n - (first?.chargedMicroCredits ?? 0n));
  });

  test('is idempotent under real concurrency: only one of two simultaneous settlements with the same key lands', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 100_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();
    const idempotencyKey = `chat:test-${crypto.randomUUID()}`;
    const params = {
      creditAccountId,
      workspaceId,
      userId,
      aiModelId,
      feature: 'chat' as const,
      refType: null,
      refId: null,
      durationMs: null,
      idempotencyKey,
      billableInputTokens: 3000,
      billableOutputTokens: 800,
      inputTokens: 3000,
      outputTokens: 800,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    const [a, b] = await Promise.all([settleCreditUsage(params), settleCreditUsage(params)]);
    const settled = [a, b].filter((result) => result !== null);

    expect(settled).toHaveLength(1);

    const spendState = await getSpendStateForUser(userId);
    expect(spendState?.balanceMicroCredits).toBe(
      100_000_000n - (settled[0]?.chargedMicroCredits ?? 0n),
    );
  });

  test('throws when the target model has no chargeable token pricing (fails closed)', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 100_000_000n,
    });
    const unpricedModel = await createAiModel({
      provider: 'anthropic',
      model: `unpriced-model-${crypto.randomUUID()}`,
      modality: 'text',
      family: 'llm',
      size: 'small',
      displayName: 'Unpriced Model',
      description: 'No pricing configured on purpose.',
      pricing: null,
      capabilities: {},
      meta: {},
    });

    const promise = settleCreditUsage({
      creditAccountId,
      workspaceId,
      userId,
      aiModelId: unpricedModel.id,
      feature: 'chat',
      refType: null,
      refId: null,
      durationMs: null,
      idempotencyKey: `chat:test-${crypto.randomUUID()}`,
      billableInputTokens: 100,
      billableOutputTokens: 50,
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    await expect(promise).rejects.toThrow(/no chargeable/);
  });
});

describe('grantCredits', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('increments the balance and the ledger records it', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({ userId });

    await grantCredits({
      creditAccountId,
      amountMicroCredits: 10_000_000n,
      kind: 'grant',
      description: 'test grant',
      idempotencyKey: `grant:test-${crypto.randomUUID()}`,
    });

    const spendState = await getSpendStateForUser(userId);
    expect(spendState?.balanceMicroCredits).toBe(10_000_000n);
  });

  test('is idempotent on idempotencyKey: a retried grant does not double-credit', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({ userId });
    const idempotencyKey = `grant:test-${crypto.randomUUID()}`;

    await grantCredits({
      creditAccountId,
      amountMicroCredits: 10_000_000n,
      kind: 'grant',
      description: null,
      idempotencyKey,
    });
    await grantCredits({
      creditAccountId,
      amountMicroCredits: 10_000_000n,
      kind: 'grant',
      description: null,
      idempotencyKey,
    });

    const spendState = await getSpendStateForUser(userId);
    expect(spendState?.balanceMicroCredits).toBe(10_000_000n);
  });
});

describe('resolveCreditSpendState vs getCreditSpendStateForOrganization', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('resolveCreditSpendState resolves through workspace -> organization -> account', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });

    const state = await resolveCreditSpendState({ workspaceId });

    expect(state?.balanceMicroCredits).toBe(5_000_000n);
    expect(state?.allowed).toBe(true);
  });

  test('returns null for a workspace whose owner has no credit account', async () => {
    const { workspaceId } = await seedAuthenticatedUser();

    const state = await resolveCreditSpendState({ workspaceId });

    expect(state).toBeNull();
  });

  test('getCreditSpendStateForOrganization reads an organization balance without a workspace in scope', async () => {
    const { userId } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 2_000_000n });

    const state = await getSpendStateForUser(userId);

    expect(state?.balanceMicroCredits).toBe(2_000_000n);
    expect(state?.allowed).toBe(true);
  });
});

describe('organization billing', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('a second org member spending in the owner workspace is billed to the org account', async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const organizationId = await getOrganizationIdByUserId({ userId: owner.userId });
    if (!organizationId) throw new Error('owner has no organization');
    await db.insert(member).values({
      organizationId,
      userId: other.userId,
      role: 'member',
      createdAt: new Date(),
    });
    const { creditAccountId } = await seedCreditAccount({
      userId: owner.userId,
      balanceMicroCredits: 100_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();

    const spendState = await resolveCreditSpendState({ workspaceId: owner.workspaceId });
    expect(spendState?.creditAccountId).toBe(creditAccountId);

    await settleCreditUsage({
      creditAccountId,
      workspaceId: owner.workspaceId,
      userId: other.userId,
      aiModelId,
      feature: 'chat',
      refType: null,
      refId: null,
      durationMs: null,
      idempotencyKey: `chat:test-${crypto.randomUUID()}`,
      billableInputTokens: 1000,
      billableOutputTokens: 500,
      inputTokens: 1000,
      outputTokens: 500,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    const events = await db.query.creditUsageEvent.findMany({ where: { creditAccountId } });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(other.userId);
    const after = await getCreditSpendStateForOrganization({ organizationId });
    expect(after?.balanceMicroCredits).toBeLessThan(100_000_000n);
  });

  test('getOrCreateCreditAccountByOrganizationId is idempotent', async () => {
    const { userId } = await seedAuthenticatedUser();
    const organizationId = await getOrganizationIdByUserId({ userId });
    if (!organizationId) throw new Error('user has no organization');

    const first = await getOrCreateCreditAccountByOrganizationId({ organizationId });
    const second = await getOrCreateCreditAccountByOrganizationId({ organizationId });

    expect(second.id).toBe(first.id);
    expect(first.organizationId).toBe(organizationId);
  });
});
