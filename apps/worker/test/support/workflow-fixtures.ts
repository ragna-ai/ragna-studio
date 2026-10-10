import { createAgent, createWorkflowRun, db } from '@repo/database';
import { workflow } from '@repo/database/schema';
import type { WorkflowRun } from '@repo/database';
import { seedCreditAccount, seedTokenPricedAiModel } from '@repo/testing';
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '@repo/workflow';

const ORIGIN = { x: 0, y: 0 };

export function triggerNode(id = 'trigger'): WorkflowNode {
  return {
    id,
    type: 'trigger',
    position: ORIGIN,
    data: { label: 'Start', config: { kind: 'manual' } },
  };
}

export function transformNode(id: string, template: string): WorkflowNode {
  return { id, type: 'transform', position: ORIGIN, data: { label: id, config: { template } } };
}

export function conditionNode(id: string, left: string, right: string): WorkflowNode {
  return {
    id,
    type: 'condition',
    position: ORIGIN,
    data: { label: id, config: { left, operator: 'equals', right } },
  };
}

export function agentNode(id: string, agentId: string, prompt: string): WorkflowNode {
  return { id, type: 'agent', position: ORIGIN, data: { label: id, config: { agentId, prompt } } };
}

export function edge(
  source: string,
  target: string,
  sourceHandle?: WorkflowEdge['sourceHandle'],
): WorkflowEdge {
  return { id: `${source}-${target}`, source, target, sourceHandle };
}

export const TRIGGER_ONLY_DEFINITION: WorkflowDefinition = { nodes: [triggerNode()], edges: [] };

export interface SeedWorkflowParams {
  userId: string | null;
  workspaceId: string;
  definition?: WorkflowDefinition;
  published?: boolean;
  scheduleCron?: string | null;
}

export async function seedWorkflow(params: SeedWorkflowParams): Promise<string> {
  const definition = params.definition ?? TRIGGER_ONLY_DEFINITION;
  const [created] = await db
    .insert(workflow)
    .values({
      userId: params.userId,
      workspaceId: params.workspaceId,
      name: 'Nightly report',
      definition,
      publishedDefinition: params.published === false ? null : definition,
      scheduleCron: params.scheduleCron ?? null,
      scheduleTimezone: params.scheduleCron ? 'Europe/Berlin' : null,
    })
    .returning({ id: workflow.id });
  if (!created) {
    throw new Error('Failed to seed workflow');
  }
  return created.id;
}

export interface SeedWorkflowRunParams {
  workflowId: string;
  triggeredByUserId: string | null;
  definition?: WorkflowDefinition;
  input?: string;
}

export function seedWorkflowRun(params: SeedWorkflowRunParams): Promise<WorkflowRun> {
  return createWorkflowRun({
    workflowId: params.workflowId,
    definition: params.definition ?? TRIGGER_ONLY_DEFINITION,
    input: params.input,
    triggeredBy: 'manual',
    triggeredByUserId: params.triggeredByUserId,
  });
}

export interface SeedPricedAgentParams {
  userId: string;
  workspaceId: string;
  /** Fund the user's organization so the credit gate lets agent nodes run. */
  funded?: boolean;
}

/** Seeds an agent on a token-priced model, and by default funds the organization. */
export async function seedPricedAgent(params: SeedPricedAgentParams): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  if (params.funded !== false) {
    await seedCreditAccount({ userId: params.userId, balanceMicroCredits: 10_000_000n });
  }
  const agent = await createAgent({
    userId: params.userId,
    workspaceId: params.workspaceId,
    aiModelId,
    name: 'Writer',
    description: 'Seeded for worker tests',
    systemPrompt: 'Write.',
    isDefault: false,
    tools: [],
  });
  return agent.id;
}
