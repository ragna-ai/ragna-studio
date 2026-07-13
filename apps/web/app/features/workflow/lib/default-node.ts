import type { WorkflowNode, WorkflowNodeType } from '@repo/workflow';
import { nanoid } from 'nanoid';
import { NODE_TYPE_LABELS } from '~/features/workflow/types/node-data';

/** Builds a new node with a sensible default config, ready to drop on the canvas. */
export function createWorkflowNode(
  type: WorkflowNodeType,
  position: { x: number; y: number },
): WorkflowNode {
  const id = `node-${nanoid(8)}`;
  const label = NODE_TYPE_LABELS[type];

  // A switch (rather than a lookup keyed by config type) lets TypeScript
  // narrow each returned object against the matching member of the
  // WorkflowNode discriminated union.
  switch (type) {
    case 'trigger':
      return { id, type, position, data: { label, config: { kind: 'manual' } } };
    case 'agent':
      return { id, type, position, data: { label, config: { prompt: '{{input}}' } } };
    case 'tool':
      return {
        id,
        type,
        position,
        data: { label, config: { tool: 'webSearch', input: '{{input}}' } },
      };
    case 'condition':
      return {
        id,
        type,
        position,
        data: { label, config: { left: '{{input}}', operator: 'isNotEmpty' } },
      };
    case 'transform':
      return { id, type, position, data: { label, config: { template: '{{input}}' } } };
  }
}

const GRID_COLUMNS = 4;
const GRID_SPACING_X = 280;
const GRID_SPACING_Y = 180;
const GRID_ORIGIN = { x: 80, y: 80 };

/** Lays out new nodes left-to-right, top-to-bottom so they never stack. */
export function nextFreePosition(existingNodeCount: number): { x: number; y: number } {
  const column = existingNodeCount % GRID_COLUMNS;
  const row = Math.floor(existingNodeCount / GRID_COLUMNS);
  return {
    x: GRID_ORIGIN.x + column * GRID_SPACING_X,
    y: GRID_ORIGIN.y + row * GRID_SPACING_Y,
  };
}
