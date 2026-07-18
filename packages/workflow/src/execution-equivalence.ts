import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from './definition.schema';

/** The subset of a node's fields that affect what a run actually does. */
type ExecutionNode = {
  id: WorkflowNode['id'];
  type: WorkflowNode['type'];
  config: WorkflowNode['data']['config'];
};

/** The subset of an edge's fields that affect what a run actually does. */
type ExecutionEdge = {
  source: WorkflowEdge['source'];
  target: WorkflowEdge['target'];
  sourceHandle: WorkflowEdge['sourceHandle'] | null;
};

function toExecutionNodes(nodes: WorkflowNode[]): ExecutionNode[] {
  return nodes
    .map((node) => ({ id: node.id, type: node.type, config: node.data.config }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function toExecutionEdges(edges: WorkflowEdge[]): ExecutionEdge[] {
  return edges
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
    }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.target.localeCompare(b.target) ||
        (a.sourceHandle ?? '').localeCompare(b.sourceHandle ?? ''),
    );
}

// Object key order is not stable across the save/publish round trip: Zod
// parse rebuilds configs in schema declaration order and Postgres jsonb
// reorders keys again on storage. Sorting keys recursively makes the
// stringify comparison order-insensitive; array order stays meaningful.
function toStableJson(value: unknown): string {
  return JSON.stringify(value, (_key, node: unknown) => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      return node;
    }
    const record = node as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
}

/**
 * Compares two definitions on the parts that change what a run does: node
 * `id`/`type`/`data.config` and edge `source`/`target`/`sourceHandle`.
 * Canvas-only bookkeeping (node `position`, `data.label`, edge `id`, styling)
 * is ignored, so moving a node or renaming its label is not "drift".
 *
 * A `null` published definition means the workflow was never published,
 * which is never equivalent to a draft.
 */
export function isExecutionEquivalent(
  draft: WorkflowDefinition,
  published: WorkflowDefinition | null,
): boolean {
  if (published === null) {
    return false;
  }

  const draftShape = {
    nodes: toExecutionNodes(draft.nodes),
    edges: toExecutionEdges(draft.edges),
  };
  const publishedShape = {
    nodes: toExecutionNodes(published.nodes),
    edges: toExecutionEdges(published.edges),
  };

  return toStableJson(draftShape) === toStableJson(publishedShape);
}
