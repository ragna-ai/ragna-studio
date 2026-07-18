import type { WorkflowTokenUsage } from '@repo/workflow';

const MS_PER_SECOND = 1000;

/** Formats a duration in ms, switching to seconds (one decimal) once it reaches 1s. */
export function formatDurationMs(durationMs: number): string {
  if (durationMs < MS_PER_SECOND) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / MS_PER_SECOND).toFixed(1)}s`;
}

/** "N tokens" for a usage badge, or undefined when nothing was reported. */
export function formatTokenUsage(usage: WorkflowTokenUsage | undefined): string | undefined {
  if (!usage) return undefined;
  const total = usage.totalTokens ?? sumKnownTokenCounts(usage);
  return total !== undefined ? `${total} tokens` : undefined;
}

function sumKnownTokenCounts(usage: WorkflowTokenUsage): number | undefined {
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) {
    return undefined;
  }
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}
