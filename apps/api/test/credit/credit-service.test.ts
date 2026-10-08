import {
  seedAuthenticatedUser,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { InternalServerErrorException, PaymentRequiredException } from '../../src/exceptions';
import { assertCanSpend } from '../../src/services/credit.service';

// assertCanSpend (apps/api/src/services/credit.service.ts) is the single
// gate policy shared by creditGuard, the WS chat path, and its worker
// mirror (specs/credits/prd.md, "apps/api — the gate policy"). None of its
// callers are in scope for Phase 1 (streaming chat/WS and apps/worker are
// both deferred, specs/testing/strategy.md), so it's exercised directly here
// rather than through a route.
describe('assertCanSpend', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('refuses a workspace whose owner has no credit account', async () => {
    const { workspaceId } = await seedAuthenticatedUser();

    await expect(assertCanSpend({ workspaceId })).rejects.toBeInstanceOf(PaymentRequiredException);
    await expect(assertCanSpend({ workspaceId })).rejects.toMatchObject({ status: 402 });
  });

  test('refuses a workspace whose account balance is zero', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId });

    await expect(assertCanSpend({ workspaceId })).rejects.toBeInstanceOf(PaymentRequiredException);
  });

  test('allows a workspace whose account has a positive balance, pricing unknown', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });

    // pricing omitted entirely: the enqueue-time creditGuard case
    // (specs/credits/prd.md), where no node's model is resolved yet.
    const spendState = await assertCanSpend({ workspaceId });

    expect(spendState?.allowed).toBe(true);
    expect(spendState?.balanceMicroCredits).toBe(5_000_000n);
  });

  // Regression: specs/credits/review-2026-07-29.md, finding 1 ("the gate
  // never checks model pricing, so 'fail closed' is not implemented"). Fixed
  // in the current code (assertCanSpend's `pricing` check, below); these
  // tests lock that fix in.
  describe('pricing gate (review finding 1)', () => {
    test('refuses a model with a non-token pricing kind, even with a positive balance', async () => {
      const { userId, workspaceId } = await seedAuthenticatedUser();
      await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });

      const promise = assertCanSpend({
        workspaceId,
        pricing: { kind: 'image', nanoUsdPerImage: 100 },
      });

      // Refused before the balance is even relevant: a platform
      // configuration problem (500), not "out of credits" (402).
      await expect(promise).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(promise).rejects.not.toBeInstanceOf(PaymentRequiredException);
    });

    test('refuses pricing: null (an unpriced model), even with a positive balance', async () => {
      const { userId, workspaceId } = await seedAuthenticatedUser();
      await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });

      await expect(assertCanSpend({ workspaceId, pricing: null })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    test('allows a token-priced model with a positive balance', async () => {
      const { userId, workspaceId } = await seedAuthenticatedUser();
      await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });
      const { pricing } = await seedTokenPricedAiModel();

      const spendState = await assertCanSpend({ workspaceId, pricing });

      expect(spendState?.allowed).toBe(true);
    });
  });
});
