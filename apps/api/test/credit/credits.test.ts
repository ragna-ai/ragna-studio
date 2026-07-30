import {
  seedAuthenticatedUser,
  seedCreditAccount,
  seedTokenPricedAiModel,
  settleTestUsage,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';

// Route-level tests for GET /credit/balance and GET /credit/usage
// (docs/credits/prd.md, "API"). Both are user-global (authMiddleware only,
// no workspaceGuard), so the only auth check is a session cookie.

const balanceResponseSchema = z.object({
  credit: z.object({
    balanceCredits: z.number(),
    balanceMicroCredits: z.string(),
  }),
});

const usageResponseSchema = z.object({
  usages: z.array(
    z.object({
      id: z.string(),
      feature: z.enum(['chat', 'workflow', 'team']),
      provider: z.string(),
      modelDisplayName: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      reasoningTokens: z.number().nullable(),
      credits: z.number(),
      createdAt: z.string(),
    }),
  ),
  meta: z.object({ totalCount: z.number() }),
});

describe('GET /credit/balance', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/credit/balance');

    expect(response.status).toBe(401);
  });

  test('reads as a zero balance for a user with no credit account yet', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/credit/balance', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(200);

    const body = balanceResponseSchema.parse(await response.json());
    expect(body.credit.balanceCredits).toBe(0);
    expect(body.credit.balanceMicroCredits).toBe('0');
  });

  test('reflects a granted balance', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 31_500_000n });

    const response = await app.request('/credit/balance', {
      headers: { cookie: cookieHeader },
    });

    const body = balanceResponseSchema.parse(await response.json());
    expect(body.credit.balanceMicroCredits).toBe('31500000');
    expect(body.credit.balanceCredits).toBe(31.5);
  });

  test('reflects a debit from a settled charge', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 100_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();

    await settleTestUsage({
      creditAccountId,
      workspaceId,
      userId,
      aiModelId,
      billableInputTokens: 3000,
      billableOutputTokens: 800,
    });

    const response = await app.request('/credit/balance', {
      headers: { cookie: cookieHeader },
    });

    const body = balanceResponseSchema.parse(await response.json());
    // CREDIT_MARKUP_BPS is pinned to "NULL" (disabled, 1.0x) for this test
    // process (apps/api/test/support/preload.ts), so charged == cost:
    // 3000 * 3000 + 800 * 15000 = 21,000,000 nanoUSD.
    expect(body.credit.balanceMicroCredits).toBe((100_000_000n - 21_000_000n).toString());
  });
});

describe('GET /credit/usage', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/credit/usage');

    expect(response.status).toBe(401);
  });

  test('returns an empty page for a user with no usage yet', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/credit/usage', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(200);

    const body = usageResponseSchema.parse(await response.json());
    expect(body.usages).toEqual([]);
    expect(body.meta.totalCount).toBe(0);
  });

  test('paginates and defaults to newest first', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 1_000_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();

    // Settle sequentially with a small gap so createdAt (ms precision) is
    // strictly increasing: ties would make "newest first" ordering
    // ambiguous at the database level.
    for (let i = 1; i <= 3; i++) {
      await settleTestUsage({
        creditAccountId,
        workspaceId,
        userId,
        aiModelId,
        billableInputTokens: 100 * i,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const firstPageResponse = await app.request('/credit/usage?page=1&limit=2', {
      headers: { cookie: cookieHeader },
    });
    const firstPage = usageResponseSchema.parse(await firstPageResponse.json());

    expect(firstPage.meta.totalCount).toBe(3);
    expect(firstPage.usages).toHaveLength(2);
    // Newest first: the last-settled charge (300 input tokens) leads.
    expect(firstPage.usages[0]?.inputTokens).toBe(300);
    expect(firstPage.usages[1]?.inputTokens).toBe(200);

    const secondPageResponse = await app.request('/credit/usage?page=2&limit=2', {
      headers: { cookie: cookieHeader },
    });
    const secondPage = usageResponseSchema.parse(await secondPageResponse.json());

    expect(secondPage.usages).toHaveLength(1);
    expect(secondPage.usages[0]?.inputTokens).toBe(100);
  });

  test('sort=asc returns oldest first', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { creditAccountId } = await seedCreditAccount({
      userId,
      balanceMicroCredits: 1_000_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();

    for (let i = 1; i <= 2; i++) {
      await settleTestUsage({
        creditAccountId,
        workspaceId,
        userId,
        aiModelId,
        billableInputTokens: 100 * i,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const response = await app.request('/credit/usage?sort=asc', {
      headers: { cookie: cookieHeader },
    });
    const body = usageResponseSchema.parse(await response.json());

    expect(body.usages[0]?.inputTokens).toBe(100);
    expect(body.usages[1]?.inputTokens).toBe(200);
  });

  test('a user only ever sees their own usage entries', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();

    const { creditAccountId: accountA } = await seedCreditAccount({
      userId: userA.userId,
      balanceMicroCredits: 1_000_000_000n,
    });
    const { creditAccountId: accountB } = await seedCreditAccount({
      userId: userB.userId,
      balanceMicroCredits: 1_000_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();

    await settleTestUsage({
      creditAccountId: accountA,
      workspaceId: userA.workspaceId,
      userId: userA.userId,
      aiModelId,
    });
    await settleTestUsage({
      creditAccountId: accountB,
      workspaceId: userB.workspaceId,
      userId: userB.userId,
      aiModelId,
    });
    await settleTestUsage({
      creditAccountId: accountB,
      workspaceId: userB.workspaceId,
      userId: userB.userId,
      aiModelId,
    });

    const responseA = await app.request('/credit/usage', {
      headers: { cookie: userA.cookieHeader },
    });
    const bodyA = usageResponseSchema.parse(await responseA.json());
    expect(bodyA.meta.totalCount).toBe(1);

    const responseB = await app.request('/credit/usage', {
      headers: { cookie: userB.cookieHeader },
    });
    const bodyB = usageResponseSchema.parse(await responseB.json());
    expect(bodyB.meta.totalCount).toBe(2);

    // Balance isolation, same seam: A's account is untouched by B's charges.
    const balanceResponseA = await app.request('/credit/balance', {
      headers: { cookie: userA.cookieHeader },
    });
    const balanceBodyA = balanceResponseSchema.parse(await balanceResponseA.json());
    expect(balanceBodyA.credit.balanceMicroCredits).not.toBe('1000000000');
  });
});
