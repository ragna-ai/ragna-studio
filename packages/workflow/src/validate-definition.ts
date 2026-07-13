import type { WorkflowDefinition } from './definition.schema';

export type WorkflowValidationResult = { valid: true } | { valid: false; errors: string[] };

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
): WorkflowValidationResult {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));

  const errors = [
    ...validateSingleTrigger(definition),
    ...validateEdgeReferences(definition, nodesById),
    ...validateConditionOnlyHandles(definition, nodesById),
    ...validateAcyclic(definition, nodesById),
  ];

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function validateSingleTrigger(definition: WorkflowDefinition): string[] {
  const triggerCount = definition.nodes.filter((node) => node.type === 'trigger').length;
  if (triggerCount === 1) {
    return [];
  }
  return [`Expected exactly one trigger node, found ${triggerCount}`];
}

function validateEdgeReferences(
  definition: WorkflowDefinition,
  nodesById: Map<string, WorkflowDefinition['nodes'][number]>,
): string[] {
  const errors: string[] = [];
  for (const edge of definition.edges) {
    if (!nodesById.has(edge.source)) {
      errors.push(`Edge "${edge.id}" references unknown source node "${edge.source}"`);
    }
    if (!nodesById.has(edge.target)) {
      errors.push(`Edge "${edge.id}" references unknown target node "${edge.target}"`);
    }
  }
  return errors;
}

function validateConditionOnlyHandles(
  definition: WorkflowDefinition,
  nodesById: Map<string, WorkflowDefinition['nodes'][number]>,
): string[] {
  const errors: string[] = [];
  for (const edge of definition.edges) {
    if (edge.sourceHandle === undefined) {
      continue;
    }
    const sourceNode = nodesById.get(edge.source);
    if (sourceNode !== undefined && sourceNode.type !== 'condition') {
      errors.push(
        `Edge "${edge.id}" sets sourceHandle "${edge.sourceHandle}" but source node "${edge.source}" is not a condition node`,
      );
    }
  }
  return errors;
}

// Depth-first search with a 3-color mark (unvisited / in-progress / done) to
// detect back-edges, i.e. cycles, without exploring the same node twice.
function validateAcyclic(
  definition: WorkflowDefinition,
  nodesById: Map<string, WorkflowDefinition['nodes'][number]>,
): string[] {
  const adjacency = buildAdjacency(definition, nodesById);
  const state = new Map<string, 'inProgress' | 'done'>();

  const hasCycleFrom = (nodeId: string): boolean => {
    if (state.get(nodeId) === 'done') {
      return false;
    }
    if (state.get(nodeId) === 'inProgress') {
      return true;
    }

    state.set(nodeId, 'inProgress');
    const hasCycle = (adjacency.get(nodeId) ?? []).some(hasCycleFrom);
    state.set(nodeId, 'done');
    return hasCycle;
  };

  const hasCycle = definition.nodes.some((node) => hasCycleFrom(node.id));
  return hasCycle ? ['Workflow graph contains a cycle'] : [];
}

function buildAdjacency(
  definition: WorkflowDefinition,
  nodesById: Map<string, WorkflowDefinition['nodes'][number]>,
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>(definition.nodes.map((node) => [node.id, []]));
  for (const edge of definition.edges) {
    if (nodesById.has(edge.source) && nodesById.has(edge.target)) {
      adjacency.get(edge.source)?.push(edge.target);
    }
  }
  return adjacency;
}
