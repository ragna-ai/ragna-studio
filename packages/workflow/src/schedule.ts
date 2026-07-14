import type { WorkflowDefinition } from './definition.schema';

// Used by the API on publish (to derive the columns denormalized onto
// `workflows`) and by the worker on startup reconciliation. `null` covers
// both the manual-trigger case and a definition with no trigger node yet.
export function getScheduleFromDefinition(
  definition: WorkflowDefinition,
): { cron: string; timezone: string } | null {
  const triggerNode = definition.nodes.find((node) => node.type === 'trigger');
  const config = triggerNode?.data.config;

  if (!config || config.kind !== 'schedule') {
    return null;
  }

  return { cron: config.cron, timezone: config.timezone };
}
