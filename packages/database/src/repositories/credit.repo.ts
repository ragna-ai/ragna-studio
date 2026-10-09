import { config } from '@repo/config';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolationError } from '../errors';
import type {
  AiModelPricing,
  CreditAccount,
  CreditLedgerKind,
  CreditUsageEvent,
  CreditUsageFeature,
} from '../schema';
import { creditAccount, creditLedger, creditUsageEvent, workspace } from '../schema';

export type {
  AiModelPricing,
  CreditAccount,
  CreditLedgerKind,
  CreditUsageEvent,
  CreditUsageFeature,
} from '../schema';

export interface CreditSpendState {
  creditAccountId: string;
  balanceMicroCredits: bigint;
  allowed: boolean;
}

export interface CreditSettlement {
  chargedMicroCredits: bigint;
  costNanoUsd: bigint;
  balanceAfterMicroCredits: bigint;
}

// Mirrors NormalizedUsage from packages/ai/src/usage.ts, duplicated rather
// than imported: @repo/database must not depend on @repo/ai's AI-SDK types.
// The field names match exactly by
// convention. Call sites must map the fields EXPLICITLY (see chat.service.ts),
// not spread `...normalizeUsage(...)`: normalizeUsage also returns
// noCacheInputTokens, which is display-only and deliberately absent here, and
// a spread would forward it (and any future extra field) silently since TS
// excess-property checks never apply to spread properties.
interface NormalizedUsageFields {
  billableInputTokens: number;
  billableOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SettleCreditUsageParams extends NormalizedUsageFields {
  creditAccountId: string;
  workspaceId: string;
  userId: string | null;
  aiModelId: string;
  feature: CreditUsageFeature;
  refType: string | null;
  refId: string | null;
  durationMs: number | null;
  idempotencyKey: string;
}

export interface GrantCreditsParams {
  creditAccountId: string;
  amountMicroCredits: bigint;
  kind: CreditLedgerKind;
  description: string | null;
  idempotencyKey: string;
}

// Pre-flight gate.
//
// `workspaceId` is a LOCATOR for the billing entity, not a billing scope.
// Credit accounts are never per-workspace: one user's workspaces all draw
// from one balance. This answers "who pays for work done here", by
// resolving workspace -> owner -> account and reading the balance in one
// join.
//
// Returns a result, never throws for business reasons. `null` means the
// billing entity has no credit account, which the caller treats as
// "no credits".
export async function resolveCreditSpendState({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<CreditSpendState | null> {
  const [row] = await db
    .select({
      creditAccountId: creditAccount.id,
      balanceMicroCredits: creditAccount.balanceMicroCredits,
    })
    .from(workspace)
    .innerJoin(creditAccount, eq(creditAccount.organizationId, workspace.organizationId))
    .where(eq(workspace.id, workspaceId));

  if (!row) {
    return null;
  }

  return {
    creditAccountId: row.creditAccountId,
    balanceMicroCredits: row.balanceMicroCredits,
    allowed: row.balanceMicroCredits > 0n,
  };
}

// The same state as `resolveCreditSpendState`, for the user-global
// `/credit/balance` and `/credit/usage` routes, which have no workspace in
// scope. A direct single-table read on the organization's account.
export async function getCreditSpendStateForOrganization({
  organizationId,
}: {
  organizationId: string;
}): Promise<CreditSpendState | null> {
  const [row] = await db
    .select({
      creditAccountId: creditAccount.id,
      balanceMicroCredits: creditAccount.balanceMicroCredits,
    })
    .from(creditAccount)
    .where(eq(creditAccount.organizationId, organizationId));

  if (!row) {
    return null;
  }

  return {
    creditAccountId: row.creditAccountId,
    balanceMicroCredits: row.balanceMicroCredits,
    allowed: row.balanceMicroCredits > 0n,
  };
}

// Post-flight settlement. One transaction. Idempotent on `idempotencyKey`;
// `null` means this run was already settled.
export async function settleCreditUsage(
  params: SettleCreditUsageParams,
): Promise<CreditSettlement | null> {
  try {
    return await db.transaction(async (tx) => {
      // Read inside the transaction, not accepted from the caller: the
      // snapshot written to `unitPrices` is then guaranteed to be the row
      // the charge was computed from, and no call site can pass stale or
      // hand-rolled prices.
      const aiModelRow = await tx.query.aiModel.findFirst({
        where: { id: params.aiModelId },
        columns: { provider: true, model: true, displayName: true, pricing: true },
      });

      if (!aiModelRow) {
        throw new Error(`settleCreditUsage: ai model ${params.aiModelId} not found`);
      }

      const { pricing } = aiModelRow;
      // Fails closed, matching the `capabilities` convention.
      // The gate should have refused the
      // run before it started on a model with no chargeable pricing;
      // getting here means pricing changed mid-run, a configuration bug.
      if (!pricing || pricing.kind !== 'token') {
        throw new Error(
          `settleCreditUsage: ai model ${params.aiModelId} has no chargeable "token" pricing`,
        );
      }

      const charge = computeCharge({
        pricing,
        billableInputTokens: params.billableInputTokens,
        billableOutputTokens: params.billableOutputTokens,
        cacheReadTokens: params.cacheReadTokens,
        cacheWriteTokens: params.cacheWriteTokens,
      });

      // Unconditional debit: v1 permits the balance to go negative.
      // The `UPDATE ... RETURNING`
      // serialises concurrent settlements on the same account at the row
      // level, so `balanceAfter` stays consistent even with several chats
      // streaming at once.
      const [debited] = await tx
        .update(creditAccount)
        .set({
          balanceMicroCredits: sql<bigint>`${creditAccount.balanceMicroCredits} - ${charge.chargedMicroCredits}`,
        })
        .where(eq(creditAccount.id, params.creditAccountId))
        .returning({ balanceMicroCredits: creditAccount.balanceMicroCredits });

      if (!debited) {
        throw new Error(`settleCreditUsage: credit account ${params.creditAccountId} not found`);
      }

      const [usageEvent] = await tx
        .insert(creditUsageEvent)
        .values({
          creditAccountId: params.creditAccountId,
          workspaceId: params.workspaceId,
          userId: params.userId,
          aiModelId: params.aiModelId,
          provider: aiModelRow.provider,
          model: aiModelRow.model,
          modelDisplayName: aiModelRow.displayName,
          feature: params.feature,
          refType: params.refType,
          refId: params.refId,
          inputTokens: params.inputTokens,
          outputTokens: params.outputTokens,
          reasoningTokens: params.reasoningTokens,
          cacheReadTokens: params.cacheReadTokens,
          cacheWriteTokens: params.cacheWriteTokens,
          billableInputTokens: params.billableInputTokens,
          billableOutputTokens: params.billableOutputTokens,
          unitPrices: pricing,
          markupBps: charge.markupBps,
          costNanoUsd: charge.costNanoUsd,
          actualCostNanoUsd: charge.actualCostNanoUsd,
          chargedMicroCredits: charge.chargedMicroCredits,
          durationMs: params.durationMs,
        })
        .returning({ id: creditUsageEvent.id });

      if (!usageEvent) {
        throw new Error('settleCreditUsage: failed to insert usage event');
      }

      // A unique violation here means this callId was already settled (a
      // retried job, a reconnect). Thrown rather than swallowed with
      // ON CONFLICT DO NOTHING, so the whole transaction, including the
      // debit and the usage event above, rolls back atomically: nothing is
      // charged twice and no orphaned usage event is left behind.
      await tx.insert(creditLedger).values({
        creditAccountId: params.creditAccountId,
        amountMicroCredits: -charge.chargedMicroCredits,
        kind: 'usage',
        usageEventId: usageEvent.id,
        idempotencyKey: params.idempotencyKey,
        balanceAfterMicroCredits: debited.balanceMicroCredits,
        description: null,
      });

      return {
        chargedMicroCredits: charge.chargedMicroCredits,
        costNanoUsd: charge.costNanoUsd,
        balanceAfterMicroCredits: debited.balanceMicroCredits,
      };
    });
  } catch (error) {
    if (isIdempotencyKeyConflict(error)) {
      return null;
    }
    throw error;
  }
}

// Resolves an organization's credit account, creating one (zero balance) if
// this is its first grant. The only account-creation path in the system:
// resolveCreditSpendState (the gate) must never create one lazily on a read.
// `ownerUserId` only fills the legacy NOT NULL `user_id` column.
export async function getOrCreateCreditAccountByOrganizationId({
  organizationId,
  ownerUserId,
}: {
  organizationId: string;
  ownerUserId: string;
}): Promise<CreditAccount> {
  const [account] = await db
    .insert(creditAccount)
    .values({ organizationId, userId: ownerUserId })
    .onConflictDoUpdate({
      target: creditAccount.organizationId,
      // No-op set: onConflictDoUpdate requires a `set`, and this table has
      // nothing to change on an existing account.
      set: { updatedAt: new Date() },
    })
    .returning();

  if (!account) {
    throw new Error(`Failed to resolve credit account for organization ${organizationId}`);
  }

  return account;
}

// Manual grant / adjustment.
export async function grantCredits({
  creditAccountId,
  amountMicroCredits,
  kind,
  description,
  idempotencyKey,
}: GrantCreditsParams): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [credited] = await tx
        .update(creditAccount)
        .set({
          balanceMicroCredits: sql<bigint>`${creditAccount.balanceMicroCredits} + ${amountMicroCredits}`,
        })
        .where(eq(creditAccount.id, creditAccountId))
        .returning({ balanceMicroCredits: creditAccount.balanceMicroCredits });

      if (!credited) {
        throw new Error(`grantCredits: credit account ${creditAccountId} not found`);
      }

      await tx.insert(creditLedger).values({
        creditAccountId,
        amountMicroCredits,
        kind,
        usageEventId: null,
        idempotencyKey,
        balanceAfterMicroCredits: credited.balanceMicroCredits,
        description,
      });
    });
  } catch (error) {
    // Same double-application guard as settleCreditUsage: a retried grant
    // with the same idempotencyKey is a no-op, not an error.
    if (isIdempotencyKeyConflict(error)) {
      return;
    }
    throw error;
  }
}

// History endpoint. No join: `modelDisplayName` etc. are denormalised onto
// the row precisely so this never has to reach into `ai_models`.
export async function listCreditUsageEvents({
  creditAccountId,
  limit,
  offset,
  sort,
}: {
  creditAccountId: string;
  limit: number;
  offset: number;
  sort: 'asc' | 'desc';
}): Promise<CreditUsageEvent[]> {
  return db.query.creditUsageEvent.findMany({
    where: { creditAccountId },
    limit,
    offset,
    orderBy: (t, { asc, desc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
  });
}

export async function countCreditUsageEvents({
  creditAccountId,
}: {
  creditAccountId: string;
}): Promise<number> {
  return db.$count(creditUsageEvent, eq(creditUsageEvent.creditAccountId, creditAccountId));
}

interface ChargeBreakdown {
  costNanoUsd: bigint;
  actualCostNanoUsd: bigint;
  chargedMicroCredits: bigint;
  markupBps: number;
}

// Pure domain math next to the write that needs it, the established pattern
// here (fractional-indexing ranks live in task.repo.ts, not a separate
// package). Module-private; exported only so a unit test can exercise the
// rounding directly.
//
// The charge formula:
//   costNanoUsd = billableInput * nanoUsdPerInputToken
//               + billableOutput * nanoUsdPerOutputToken
//   chargedMicroCredits = ceilDiv(costNanoUsd * markupBps, 10_000n)
// `actualCostNanoUsd` is the real, cache-discounted platform cost: recorded
// for margin analytics, never charged. `uncachedInput` is derived as
// billableInputTokens - cacheReadTokens - cacheWriteTokens rather than taken
// as a separate field from NormalizedUsage: that guarantees
// uncachedInput + cacheRead + cacheWrite === billableInput by construction,
// so the margin breakdown can never disagree with what the user was
// charged, whereas an unpopulated provider-supplied field would silently
// read as zero.
export function computeCharge({
  pricing,
  billableInputTokens,
  billableOutputTokens,
  cacheReadTokens,
  cacheWriteTokens,
}: {
  pricing: Extract<AiModelPricing, { kind: 'token' }>;
  billableInputTokens: number;
  billableOutputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): ChargeBreakdown {
  const nanoUsdPerInputToken = BigInt(pricing.nanoUsdPerInputToken);
  const nanoUsdPerOutputToken = BigInt(pricing.nanoUsdPerOutputToken);
  const nanoUsdPerCacheReadToken = BigInt(
    pricing.nanoUsdPerCacheReadToken ?? pricing.nanoUsdPerInputToken,
  );
  const nanoUsdPerCacheWriteToken = BigInt(
    pricing.nanoUsdPerCacheWriteToken ?? pricing.nanoUsdPerInputToken,
  );
  const markupBps = pricing.markupBps ?? config.creditMarkupBps;

  const billableInput = BigInt(billableInputTokens);
  const billableOutput = BigInt(billableOutputTokens);
  const cacheRead = BigInt(cacheReadTokens);
  const cacheWrite = BigInt(cacheWriteTokens);

  // What the user is charged: list price as if nothing were cached. Both
  // multiplications are exact; ceilDiv is the only rounding in the system.
  const costNanoUsd = billableInput * nanoUsdPerInputToken + billableOutput * nanoUsdPerOutputToken;
  const chargedMicroCredits = ceilDiv(costNanoUsd * BigInt(markupBps), 10_000n);

  const uncachedInput = billableInput - cacheRead - cacheWrite;
  const actualCostNanoUsd =
    uncachedInput * nanoUsdPerInputToken +
    cacheRead * nanoUsdPerCacheReadToken +
    cacheWrite * nanoUsdPerCacheWriteToken +
    billableOutput * nanoUsdPerOutputToken;

  return { costNanoUsd, actualCostNanoUsd, chargedMicroCredits, markupBps };
}

// Rounds up, always in the platform's favour. Module-private; exported only
// for tests.
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

// A unique violation on `credit_ledger.idempotency_key` is how
// settleCreditUsage/grantCredits detect "already applied" without a
// preceding read-then-check race.
const isIdempotencyKeyConflict = isUniqueViolationError;
