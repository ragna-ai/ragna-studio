import { config } from '@repo/config';
import type {
  AiModelPricing,
  CreditSpendState,
  CreditUsageEvent,
  CreditUsageFeature,
} from '@repo/database';
import {
  countCreditUsageEvents,
  getCreditSpendStateForOrganization,
  getMembershipByUserId,
  listCreditUsageEvents,
  resolveCreditSpendState,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import {
  InternalServerErrorException,
  OrganizationDeletedException,
  PaymentRequiredException,
} from '../exceptions';

// 1 credit = 1,000,000 micro-credits.
const MICRO_CREDITS_PER_CREDIT = 1_000_000;

export interface CreditBalanceResponse {
  balanceCredits: number;
  balanceMicroCredits: string;
}

// Deliberately omits costNanoUsd, actualCostNanoUsd, markupBps, and
// unitPrices: those are platform margin, not the user's business.
// Mapping through this interface explicitly,
// rather than returning the row, is what keeps them from leaking.
export interface CreditUsageResponse {
  id: string;
  feature: CreditUsageFeature;
  provider: string;
  modelDisplayName: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  credits: number;
  createdAt: Date;
}

export interface CreditUsageListResponse {
  usages: CreditUsageResponse[];
  totalCount: number;
}

/**
 * The single place that decides what "out of credits" means.
 * `creditGuard`, the WS
 * chat path in chat.service.ts, and this function's mirror in the worker are
 * the three entry points; all three answer to this one policy.
 *
 * Returns `null` immediately, without querying, when `CREDITS_ENABLED` is
 * off, so the system can ship dark. Otherwise throws `PaymentRequiredException`
 * when the workspace's organization has no credit account, or its balance is not
 * positive (the gate is `balance > 0`).
 *
 * `pricing` is the target model's pricing, when the caller already knows
 * which model it's about to spend on. A model with no pricing, or a `kind`
 * the charger doesn't implement (v1 only implements `token`), is not
 * chargeable, so the run is refused here rather than left to fail inside
 * settlement after the model call already ran.
 * That's a platform configuration problem, not the user being
 * out of credits, hence `InternalServerErrorException` rather than
 * `PaymentRequiredException`. `pricing === undefined` means the caller
 * cannot know the model yet (`creditGuard` at workflow-run enqueue, before
 * any node's model is resolved), so this check is skipped and only the
 * balance is checked; the worker's per-node gate covers pricing once the
 * model is known.
 */
export async function assertCanSpend({
  workspaceId,
  pricing,
}: {
  workspaceId: string;
  pricing?: AiModelPricing | null;
}): Promise<CreditSpendState | null> {
  if (!config.creditsEnabled) {
    return null;
  }

  if (pricing !== undefined && pricing?.kind !== 'token') {
    logger.error(
      `Refusing to start run for workspace ${workspaceId}: model has no chargeable token pricing`,
    );
    throw new InternalServerErrorException('Model is not chargeable: no token pricing configured');
  }

  const { error, data: spendState } = await tryCatch(() =>
    resolveCreditSpendState({ workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to resolve credit spend state', error);
    throw new InternalServerErrorException('Failed to resolve credit balance');
  }

  if (!spendState || !spendState.allowed) {
    throw new PaymentRequiredException('Out of credits');
  }

  return spendState;
}

/**
 * Resolves the credit account state of the calling user's organization for the user-global
 * `/credit/balance` and `/credit/usage` routes, which have no `:workspaceId`
 * in scope: credits belong to the account, not to a workspace.
 * A direct read on `credit_accounts.organization_id`, distinct from
 * `resolveCreditSpendState`'s workspace-locator gate. Never creates an
 * account: "no account" comes back as `null`, the same as
 * `resolveCreditSpendState` (only `grantCredits` creates one).
 */
async function resolveOwnCreditSpendState({
  userId,
}: {
  userId: string;
}): Promise<CreditSpendState | null> {
  const { error: membershipError, data: membership } = await tryCatch(() =>
    getMembershipByUserId({ userId }),
  );

  if (membershipError !== null) {
    logger.error('Failed to resolve organization for credit balance', membershipError);
    throw new InternalServerErrorException('Failed to load credit balance');
  }

  if (!membership) {
    return null;
  }

  if (membership.organizationDeletedAt) {
    throw new OrganizationDeletedException();
  }

  const { error, data: spendState } = await tryCatch(() =>
    getCreditSpendStateForOrganization({ organizationId: membership.organizationId }),
  );

  if (error !== null) {
    logger.error('Failed to resolve credit spend state', error);
    throw new InternalServerErrorException('Failed to load credit balance');
  }

  return spendState;
}

/**
 * [GET] /credit/balance
 * A user with no credit account yet reads the same as a zero balance,
 * rather than a 404 or an error.
 */
export async function getCreditBalanceForUser({
  userId,
}: {
  userId: string;
}): Promise<CreditBalanceResponse> {
  const spendState = await resolveOwnCreditSpendState({ userId });
  const balanceMicroCredits = spendState?.balanceMicroCredits ?? 0n;

  return {
    balanceCredits: Number(balanceMicroCredits) / MICRO_CREDITS_PER_CREDIT,
    // bigint is not JSON-serialisable, so this crosses the API boundary as a
    // string.
    balanceMicroCredits: balanceMicroCredits.toString(),
  };
}

function toCreditUsageResponse(event: CreditUsageEvent): CreditUsageResponse {
  return {
    id: event.id,
    feature: event.feature,
    provider: event.provider,
    modelDisplayName: event.modelDisplayName,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    reasoningTokens: event.reasoningTokens,
    credits: Number(event.chargedMicroCredits) / MICRO_CREDITS_PER_CREDIT,
    createdAt: event.createdAt,
  };
}

/**
 * [GET] /credit/usage
 * Paginated history of what the user's account has spent credits on,
 * newest first by default.
 */
export async function listCreditUsageForUser({
  userId,
  page,
  limit,
  sort,
}: {
  userId: string;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}): Promise<CreditUsageListResponse> {
  const spendState = await resolveOwnCreditSpendState({ userId });

  // No account yet means no usage yet.
  if (!spendState) {
    return { usages: [], totalCount: 0 };
  }

  const { creditAccountId } = spendState;
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    countCreditUsageEvents({ creditAccountId }),
  );

  if (countError !== null || totalCount === null) {
    logger.error('Failed to count credit usage events', countError);
    throw new InternalServerErrorException('Failed to load credit usage');
  }

  const { error, data: events } = await tryCatch(() =>
    listCreditUsageEvents({ creditAccountId, limit, offset, sort }),
  );

  if (error !== null || !events) {
    logger.error('Failed to list credit usage events', error);
    throw new InternalServerErrorException('Failed to load credit usage');
  }

  return {
    usages: events.map(toCreditUsageResponse),
    totalCount,
  };
}
