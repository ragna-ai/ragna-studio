import { normalizeUsage } from '@repo/ai';
import { config } from '@repo/config';
import type { AiModelPricing, CreditSpendState, CreditUsageFeature } from '@repo/database';
import { resolveCreditSpendState, settleCreditUsage } from '@repo/database';
import { logger } from '@repo/logger';
import type { GenerateTextSteps } from './agent-trace';

// Thrown when the pre-run gate refuses a run for lack of credits. A distinct
// class (rather than a plain Error) so the step's recorded error message
// reads as "Insufficient credits", distinguishable from a generic run
// failure once it reaches upsertRunStep's `error` text column.
export class InsufficientCreditsError extends Error {
  constructor(workspaceId: string) {
    super(
      `Insufficient credits: workspace ${workspaceId}'s billing account has no positive balance`,
    );
    this.name = 'InsufficientCreditsError';
  }
}

// Thrown when the pre-run gate refuses a run because the target model has
// no chargeable pricing: no `pricing` jsonb, or a `kind` the charger doesn't
// implement yet (v1 only implements 'token'). A distinct class from
// InsufficientCreditsError because this is a platform configuration
// problem, not something the user can fix by buying credits, so the run
// step's error text should read as a config bug rather than "out of
// credits".
export class ModelNotChargeableError extends Error {
  constructor(workspaceId: string) {
    super(
      `Model is not chargeable: workspace ${workspaceId}'s run targets a model with no token pricing configured`,
    );
    this.name = 'ModelNotChargeableError';
  }
}

// Pre-run gate, shared by every LLM call a workflow run makes on a user's
// behalf: the agent node, the team node's lead call, and each team member's delegate call.
// Returns null both when
// credits are off (skipped entirely, no query) and when the billing entity
// has no account; either way the caller's later settleWorkflowUsage call
// must also skip, so gating and settling can never happen independently.
//
// `pricing` is the target model's pricing. Every call site in this file
// knows its model by the time it gates (the gate runs after the agent
// record is loaded, see runReferencedAgent below), so `pricing` is passed
// there rather than left undefined, unlike apps/api's `assertCanSpend`
// which also serves the enqueue-time `creditGuard` that doesn't know the
// model yet. A model with no pricing, or a `kind` the charger doesn't
// implement (v1 only implements 'token'), is not chargeable, so the run is
// refused here rather than left to fail inside settlement after the model
// call already ran.
export async function gateCreditSpend({
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
    throw new ModelNotChargeableError(workspaceId);
  }

  const spendState = await resolveCreditSpendState({ workspaceId });
  if (!spendState?.allowed) {
    throw new InsufficientCreditsError(workspaceId);
  }

  return spendState;
}

// Everything that identifies one charge. `idempotencyKey` is stable across a retry of the same
// run, so a repeated settlement never charges twice.
export interface UsageCharge {
  feature: CreditUsageFeature;
  refType: string;
  refId: string;
  idempotencyKey: string;
}

export interface SettleUsageChargeInput {
  spendState: CreditSpendState | null;
  workspaceId: string;
  userId: string;
  aiModelId: string;
  provider: string;
  steps: GenerateTextSteps;
  charge: UsageCharge;
  durationMs: number;
}

// Post-run settlement, paired with gateCreditSpend above. `spendState` is whatever the matching
// gate call returned: null short-circuits this to a no-op, so a caller can always call both
// unconditionally without its own creditsEnabled check.
//
// A settlement failure (a transient DB error, say) must not throw away a completed run over a
// bookkeeping problem. A dropped charge is a reconciliation bug to fix later.
export async function settleUsageCharge({
  spendState,
  workspaceId,
  userId,
  aiModelId,
  provider,
  steps,
  charge,
  durationMs,
}: SettleUsageChargeInput): Promise<void> {
  if (!spendState) {
    return;
  }

  try {
    const normUsage = normalizeUsage(provider, steps);

    await settleCreditUsage({
      creditAccountId: spendState.creditAccountId,
      workspaceId,
      userId,
      aiModelId,
      feature: charge.feature,
      refType: charge.refType,
      refId: charge.refId,
      durationMs,
      idempotencyKey: charge.idempotencyKey,
      billableInputTokens: normUsage.billableInputTokens,
      billableOutputTokens: normUsage.billableOutputTokens,
      inputTokens: normUsage.inputTokens,
      outputTokens: normUsage.outputTokens,
      reasoningTokens: normUsage.reasoningTokens,
      // Deliberately no noCacheInputTokens: it's a display-only breakdown of inputTokens.
      cacheReadTokens: normUsage.cacheReadTokens,
      cacheWriteTokens: normUsage.cacheWriteTokens,
    });
  } catch (error) {
    logger.error(`Failed to settle credit usage ${charge.idempotencyKey}:`, error);
  }
}
