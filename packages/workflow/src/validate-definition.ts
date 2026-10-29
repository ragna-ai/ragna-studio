import type { WorkflowDefinition } from './definition.schema';

export type WorkflowGraphIssueCode =
  | 'triggerCount'
  | 'unknownEdgeNode'
  | 'conditionHandle'
  | 'cycle';

export interface WorkflowGraphIssue {
  code: WorkflowGraphIssueCode;
  message: string;
}

export type WorkflowValidationResult =
  | { valid: true }
  | { valid: false; issues: WorkflowGraphIssue[] };

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
): WorkflowValidationResult {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));

  const issues = [
    ...validateSingleTrigger(definition),
    ...validateEdgeReferences(definition, nodesById),
    ...validateConditionOnlyHandles(definition, nodesById),
    ...validateAcyclic(definition, nodesById),
  ];

  return issues.length > 0 ? { valid: false, issues } : { valid: true };
}

function validateSingleTrigger(definition: WorkflowDefinition): WorkflowGraphIssue[] {
  const triggerCount = definition.nodes.filter((node) => node.type === 'trigger').length;
  if (triggerCount === 1) {
    return [];
  }
  return [
    { code: 'triggerCount', message: `Expected exactly one trigger node, found ${triggerCount}` },
  ];
}

function validateEdgeReferences(
  definition: WorkflowDefinition,
  nodesById: Map<string, WorkflowDefinition['nodes'][number]>,
): WorkflowGraphIssue[] {
  const issues: WorkflowGraphIssue[] = [];
  for (const edge of definition.edges) {
    if (!nodesById.has(edge.source)) {
      issues.push({
        code: 'unknownEdgeNode',
        message: `Edge "${edge.id}" references unknown source node "${edge.source}"`,
      });
    }
    if (!nodesById.has(edge.target)) {
      issues.push({
        code: 'unknownEdgeNode',
        message: `Edge "${edge.id}" references unknown target node "${edge.target}"`,
      });
    }
  }
  return issues;
}

function validateConditionOnlyHandles(
  definition: WorkflowDefinition,
  nodesById: Map<string, WorkflowDefinition['nodes'][number]>,
): WorkflowGraphIssue[] {
  const issues: WorkflowGraphIssue[] = [];
  for (const edge of definition.edges) {
    if (edge.sourceHandle === undefined) {
      continue;
    }
    const sourceNode = nodesById.get(edge.source);
    if (sourceNode !== undefined && sourceNode.type !== 'condition') {
      issues.push({
        code: 'conditionHandle',
        message: `Edge "${edge.id}" sets sourceHandle "${edge.sourceHandle}" but source node "${edge.source}" is not a condition node`,
      });
    }
  }
  return issues;
}

// Depth-first search with a 3-color mark (unvisited / in-progress / done) to
// detect back-edges, i.e. cycles, without exploring the same node twice.
function validateAcyclic(
  definition: WorkflowDefinition,
  nodesById: Map<string, WorkflowDefinition['nodes'][number]>,
): WorkflowGraphIssue[] {
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
  return hasCycle ? [{ code: 'cycle', message: 'Workflow graph contains a cycle' }] : [];
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
