import { z } from 'zod';
import {
  agentConfigSchema,
  conditionConfigSchema,
  teamConfigSchema,
  toolConfigSchema,
  transformConfigSchema,
  triggerConfigSchema,
} from './config.schema';

export const NODE_TYPES = ['trigger', 'agent', 'tool', 'condition', 'transform', 'team'] as const;
export type WorkflowNodeType = (typeof NODE_TYPES)[number];

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// vue-flow node shape: id/type/position/data, with `data.config` typed per node type.
const workflowNodeSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('trigger'),
    position: positionSchema,
    data: z.object({ label: z.string(), config: triggerConfigSchema }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('agent'),
    position: positionSchema,
    data: z.object({ label: z.string(), config: agentConfigSchema }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('tool'),
    position: positionSchema,
    data: z.object({ label: z.string(), config: toolConfigSchema }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('condition'),
    position: positionSchema,
    data: z.object({ label: z.string(), config: conditionConfigSchema }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('transform'),
    position: positionSchema,
    data: z.object({ label: z.string(), config: transformConfigSchema }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('team'),
    position: positionSchema,
    data: z.object({ label: z.string(), config: teamConfigSchema }),
  }),
]);

// Branching uses sourceHandle 'true'/'false' on edges leaving a condition node.
export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.enum(['true', 'false']).optional(),
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

/** Distinct agent ids referenced by any node of the definition. */
export function getWorkflowAgentIds(definition: WorkflowDefinition): string[] {
  const agentIds = new Set<string>();

  for (const node of definition.nodes) {
    if (node.type === 'agent' && node.data.config.agentId) {
      agentIds.add(node.data.config.agentId);
    }
    if (node.type === 'team') {
      const { leadAgentId, members } = node.data.config;
      if (leadAgentId) {
        agentIds.add(leadAgentId);
      }
      for (const member of members) {
        agentIds.add(member.agentId);
      }
    }
  }

  return [...agentIds];
}
