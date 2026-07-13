import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '@repo/workflow';

/**
 * Vue Flow's v-model:nodes/edges hand back GraphNode/GraphEdge: our
 * WorkflowNode/WorkflowEdge plus canvas bookkeeping (computedPosition,
 * dimensions, selected, full sourceNode/targetNode references, ...). This
 * strips that back down to the plain shape the API persists, so Save/Publish
 * send exactly what the canvas needs to be rebuilt from.
 *
 * The node cast is safe: every GraphNode is a structural superset of
 * WorkflowNode, and the object literal below only ever picks the fields for
 * the node's own type, so the type/data pairing stays correct. TypeScript
 * just can't prove that correlation survives a `.map`.
 */
export function toWorkflowDefinition(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowDefinition {
  return {
    nodes: nodes.map(
      (node) =>
        ({
          id: node.id,
          type: node.type,
          position: { x: node.position.x, y: node.position.y },
          data: { label: node.data.label, config: node.data.config },
        }) as WorkflowNode,
    ),
    edges: edges.map((edge) => {
      const plain: WorkflowEdge = { id: edge.id, source: edge.source, target: edge.target };
      return edge.sourceHandle ? { ...plain, sourceHandle: edge.sourceHandle } : plain;
    }),
  };
}
