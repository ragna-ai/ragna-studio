import type {
  AgentSettings,
  AiModelPricing,
  CreditSpendState,
  CreditUsageFeature,
} from '@repo/database';
import { getAgentByIdAndWorkspaceId } from '@repo/database';
import type { WorkflowAgentTraceStep, WorkflowTokenUsage } from '@repo/workflow';
import type { GenerateTextSteps } from '../../agents/agent-trace';
import { settleUsageCharge } from '../../agents/credit-gate';
import { runAgentUnattended } from '../../agents/unattended-agent';

export type AiModelRef = { provider: string; model: string; pricing: AiModelPricing | null };
type AgentSettingsRef = AgentSettings | null;

// Stored definitions are not re-validated at run time, so a node saved before
// agents became required can reach an executor without one.
export function requireAgentId(agentId: string | undefined): string {
  if (!agentId) {
    throw new Error('Pick an agent for this node');
  }
  return agentId;
}

// getAgentByIdAndWorkspaceId loads the `aiModel` relation, but its
// declared return type doesn't carry it (see agent.repo.ts). Narrow locally
// instead of widening the shared repo types.
export function withAiModel<T>(record: T): T & { aiModel: AiModelRef } {
  return record as T & { aiModel: AiModelRef };
}

// Same narrowing as withAiModel, widened for the agentId path, which also
// needs the agent's own `settings` column to run it like chat does.
export function withAgentConfig<T>(
  record: T,
): T & { aiModel: AiModelRef; settings: AgentSettingsRef } {
  return record as T & { aiModel: AiModelRef; settings: AgentSettingsRef };
}

export type ReferencedAgentRun = {
  text: string;
  trace: WorkflowAgentTraceStep[];
  usage: WorkflowTokenUsage;
};

// Settles one workflow call: a thin wrapper over the shared charge with the workflow's key.
export async function settleWorkflowUsage({
  spendState,
  workspaceId,
  userId,
  aiModelId,
  provider,
  steps,
  feature,
  runId,
  nodeId,
  callId,
  durationMs,
}: {
  spendState: CreditSpendState | null;
  workspaceId: string;
  userId: string;
  aiModelId: string;
  provider: string;
  steps: GenerateTextSteps;
  feature: CreditUsageFeature;
  // Stable across a BullMQ retry of the same run/node/call. callId is a constant for calls that
  // happen once per node ('agent', 'lead') or the AI SDK's toolCallId for a team member's calls.
  runId: string;
  nodeId: string;
  callId: string;
  durationMs: number;
}): Promise<void> {
  await settleUsageCharge({
    spendState,
    workspaceId,
    userId,
    aiModelId,
    provider,
    steps,
    durationMs,
    charge: {
      feature,
      refType: 'workflowRun',
      refId: runId,
      idempotencyKey: `workflow:${runId}:${nodeId}:${callId}`,
    },
  });
}

// Runs a referenced agent exactly like it does in chat: same instructions,
// full toolset (noop writer, workflow runs have no chat UI to stream to),
// temperature, and step budget. Shared by the agent node (one agent) and
// the team node (each member, run once per delegate call).
export async function runReferencedAgent({
  agentId,
  userId,
  workspaceId,
  prompt,
  runId,
  nodeId,
  callId,
  feature,
}: {
  agentId: string;
  userId: string;
  workspaceId: string;
  prompt: string;
  runId: string;
  nodeId: string;
  callId: string;
  feature: CreditUsageFeature;
}): Promise<ReferencedAgentRun> {
  const agentRecord = await getAgentByIdAndWorkspaceId({ agentId, workspaceId });
  if (!agentRecord) {
    throw new Error(`Agent "${agentId}" not found in this workspace`);
  }

  return runAgentUnattended({
    agentId,
    workspaceId,
    userId,
    config: {
      aiModelId: agentRecord.aiModelId,
      systemPrompt: agentRecord.systemPrompt,
      context: agentRecord.context,
      toolGrants: agentRecord.toolGrants,
      defaultDatasetId: agentRecord.defaultDatasetId,
      settings: agentRecord.settings,
    },
    prompt,
    charge: {
      feature,
      refType: 'workflowRun',
      refId: runId,
      idempotencyKey: `workflow:${runId}:${nodeId}:${callId}`,
    },
    // A plan-executing agent node can exhaust the chat-level step budget immediately (schema read
    // + row list + work + row update already costs 4). Flat 15 for every workflow agent run.
    maxSteps: 15,
    logLabel: `agent "${agentRecord.name}"`,
  });
}
