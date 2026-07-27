// packages/ai/src/usage.ts

import type { generateText } from 'ai';
import { logger } from '@repo/logger';

/**
 * One step of a generateText/streamText run. Derived from generateText's
 * own return type (the pattern already used in
 * apps/worker/src/workflow/executors/run-referenced-agent.ts:33-37) instead
 * of a hand-rolled structural type, so this stays correct if the AI SDK's
 * step shape changes. streamText steps share the same `StepResult` type
 * from the SDK, so this also covers the chat path.
 */
type UsageStep = Awaited<ReturnType<typeof generateText>>['steps'][number];

// Providers this function has been verified against (see the comment on
// normalizeUsage). Anything else still gets charged the same way, but logs
// a warning so an unverified provider doesn't silently undercharge.
const VERIFIED_PROVIDERS = new Set(['anthropic', 'openai', 'google-genai', 'google-vertex']);

export interface NormalizedUsage {
  /** What the credit system charges for input, per docs/credits/prd.md. */
  billableInputTokens: number;
  /** What the credit system charges for output. */
  billableOutputTokens: number;
  /** Input tokens as reported by the provider. */
  inputTokens: number;
  /** Output tokens as reported by the provider. */
  outputTokens: number;
  /** Already included in outputTokens; broken out for display only. */
  reasoningTokens: number;
  /** Uncached portion of input; for margin analytics only, never charged. */
  noCacheInputTokens: number;
  /** For margin analytics only, never for what the user is charged. */
  cacheReadTokens: number;
  /** For margin analytics only, never for what the user is charged. */
  cacheWriteTokens: number;
}

function sumSteps(steps: readonly UsageStep[], select: (step: UsageStep) => number | undefined) {
  return steps.reduce((total, step) => total + (select(step) ?? 0), 0);
}

/**
 * Normalizes a run's per-step usage into the token counts the credit system
 * charges from. Takes `steps` rather than a single usage object because a
 * multi-step tool run needs every step's counts, not just the final one
 * (see the cache-token note below).
 *
 * ## Why cache tokens come from `usage`, not `providerMetadata`
 *
 * The original plan for this function was to read cache-read/cache-write
 * counts out of each step's `providerMetadata`, on the assumption (true for
 * the older LanguageModelV2 provider spec) that `usage.cachedInputTokens`
 * is never populated, that cache counts only exist in provider-specific
 * `providerMetadata` keys, and that Anthropic's `inputTokens` excludes
 * cache reads while OpenAI's and Google's include them.
 *
 * That is no longer true for the AI SDK versions installed in this repo
 * (`ai@7.0.34`, `@ai-sdk/anthropic@4.0.18`, `@ai-sdk/openai@4.0.17`,
 * `@ai-sdk/google@4.0.21`, `@ai-sdk/google-vertex@5.0.25`), all of which
 * implement the newer LanguageModelV4 provider spec. Verified by reading
 * each adapter's usage-conversion code directly (not provider docs, which
 * describe the raw API, not what the AI SDK normalizes it to):
 *
 * | Provider | raw field(s) | `step.usage.inputTokens` |
 * | --- | --- | --- |
 * | anthropic | `input_tokens` excludes cache; the adapter adds `cache_creation_input_tokens` + `cache_read_input_tokens` back in before it ever reaches `usage` | already cache-inclusive |
 * | openai | `prompt_tokens`, already inclusive of `prompt_tokens_details.cached_tokens` | already cache-inclusive |
 * | google-genai, google-vertex | `promptTokenCount`, already inclusive of `cachedContentTokenCount` (google-vertex imports the same `GoogleLanguageModel` class from `@ai-sdk/google/internal`, so this is one code path, not two) | already cache-inclusive |
 *
 * Every provider's adapter also breaks the cache counts out separately on
 * `step.usage.inputTokenDetails.cacheReadTokens` / `.cacheWriteTokens`, so
 * there is no need to touch `providerMetadata` (which, for what it's
 * worth, is also the final step only on a multi-step run and would have
 * undercounted every step before it).
 *
 * The upshot: `billableInputTokens` is `Σ step.usage.inputTokens` for
 * every provider, with no per-provider addition. Adding `cacheReadTokens`
 * on top, as the old design called for, would now double-count a cached
 * run and undercharge the user. `provider` is still taken as a parameter
 * and checked against the providers this was verified against, purely as
 * a canary: if a future provider or an SDK upgrade stops upholding the
 * LanguageModelV4 guarantee above, this should log instead of silently
 * undercharging.
 *
 * `reasoningTokens` is already part of `outputTokens` for every provider
 * (it's a breakdown of the same total, not an addition to it) and is
 * reported here for display only; it must never be added when charging.
 */
export function normalizeUsage(provider: string, steps: readonly UsageStep[]): NormalizedUsage {
  if (!VERIFIED_PROVIDERS.has(provider)) {
    logger.warn(
      `normalizeUsage: unverified provider "${provider}"; trusting usage.inputTokens as already cache-inclusive`,
    );
  }

  const inputTokens = sumSteps(steps, (step) => step.usage.inputTokens);
  const outputTokens = sumSteps(steps, (step) => step.usage.outputTokens);
  const reasoningTokens = sumSteps(steps, (step) => step.usage.outputTokenDetails.reasoningTokens);
  const noCacheInputTokens = sumSteps(steps, (step) => step.usage.inputTokenDetails.noCacheTokens);
  const cacheReadTokens = sumSteps(steps, (step) => step.usage.inputTokenDetails.cacheReadTokens);
  const cacheWriteTokens = sumSteps(steps, (step) => step.usage.inputTokenDetails.cacheWriteTokens);

  return {
    billableInputTokens: inputTokens,
    billableOutputTokens: outputTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
    noCacheInputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
}
