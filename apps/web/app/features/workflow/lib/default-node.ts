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
        data: { label, config: { tool: 'placeholder', input: '{{input}}' } },
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
    case 'team':
      return {
        id,
        type,
        position,
        data: {
          label,
          config: {
            mode: 'delegate',
            prompt: '{{input}}',
            members: [{ agentId: '', role: '' }],
          },
        },
      };
  }
}

const VERTICAL_SPACING = 180;
const ORIGIN = { x: 80, y: 80 };

/**
 * Places a new node directly below the most recently added one, keeping all
 * nodes stacked along the left side of the canvas. This avoids the grid
 * layout's wide columns, which used to land new nodes underneath the
 * right-side config panel. Falls back to the origin when the canvas is empty.
 */
export function nextFreePosition(existingNodes: WorkflowNode[]): { x: number; y: number } {
  const lastNode = existingNodes.at(-1);
  if (!lastNode) {
    return { ...ORIGIN };
  }
  return {
    x: lastNode.position.x,
    y: lastNode.position.y + VERTICAL_SPACING,
  };
}
