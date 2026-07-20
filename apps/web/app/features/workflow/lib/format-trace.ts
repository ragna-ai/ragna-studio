import type { WorkflowTokenUsage } from '@repo/workflow';

const MS_PER_SECOND = 1000;

/** Formats a duration in ms, switching to seconds (one decimal) once it reaches 1s. */
export function formatDurationMs(durationMs: number): string {
  if (durationMs < MS_PER_SECOND) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / MS_PER_SECOND).toFixed(1)}s`;
}

/** Total token count for a usage badge, or undefined when nothing was reported. */
export function tokenUsageTotal(usage: WorkflowTokenUsage | undefined): number | undefined {
  if (!usage) return undefined;
  return usage.totalTokens ?? sumKnownTokenCounts(usage);
}

function sumKnownTokenCounts(usage: WorkflowTokenUsage): number | undefined {
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) {
    return undefined;
  }
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}
