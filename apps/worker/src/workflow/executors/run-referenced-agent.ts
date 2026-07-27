import {
  buildAgentInstructions,
  buildAgentToolset,
  generateText,
  getLanguageModel,
  normalizeUsage,
  stepCountIs,
  toModelSettings,
} from '@repo/ai';
import { config } from '@repo/config';
import type { AgentSettings, AgentTools, CreditSpendState, CreditUsageFeature } from '@repo/database';
import { getAgentById, resolveCreditSpendState, settleCreditUsage } from '@repo/database';
import { logger } from '@repo/logger';
import type { WorkflowAgentTraceStep, WorkflowTokenUsage, WorkflowToolCall } from '@repo/workflow';
import { noopWriter } from './noop-writer';

// Thrown when the pre-run gate refuses a run for lack of credits. A distinct
// class (rather than a plain Error) so the step's recorded error message
// reads as "Insufficient credits", distinguishable from a generic run
// failure once it reaches upsertRunStep's `error` text column
// (docs/credits/prd.md, "Call sites": "A run refused mid-execution fails the
// run with a reason the UI can distinguish from a generic error").
export class InsufficientCreditsError extends Error {
  constructor(workspaceId: string) {
    super(`Insufficient credits: workspace ${workspaceId}'s billing account has no positive balance`);
    this.name = 'InsufficientCreditsError';
  }
}

export type AiModelRef = { provider: string; model: string };
type AgentSettingsRef = AgentSettings | null;

// getAgentById/getDefaultAgent both load the `aiModel` relation, but their
// declared return types don't carry it (see agent.repo.ts). Narrow locally
// instead of widening the shared repo types.
export function withAiModel<T>(record: T): T & { aiModel: AiModelRef } {
  return record as T & { aiModel: AiModelRef };
}

// Same narrowing as withAiModel, widened for the agentId path, which also
// needs the agent's own `tools`/`settings` columns to run it like chat does.
export function withAgentConfig<T>(
  record: T,
): T & { aiModel: AiModelRef; tools: AgentTools; settings: AgentSettingsRef } {
  return record as T & { aiModel: AiModelRef; tools: AgentTools; settings: AgentSettingsRef };
}

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;
type GenerateTextSteps = GenerateTextResult['steps'];
type GenerateTextStep = GenerateTextSteps[number];
type GenerateTextContentPart = GenerateTextStep['content'][number];
type GenerateTextUsage = GenerateTextResult['usage'];
type ToolErrorPart = Extract<GenerateTextContentPart, { type: 'tool-error' }>;

function isToolErrorPart(part: GenerateTextContentPart): part is ToolErrorPart {
  return part.type === 'tool-error';
}

function formatToolError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toWorkflowUsage(usage: GenerateTextUsage): WorkflowTokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

// Metadata a delegate call attaches to its own tool-call entry once the
// member run it triggered has finished: the member's own tool calls (kept
// flat, not a nested trace, see docs/workflow/workflows-team-node.md), how
// long the member run took, and its total token usage.
export type DelegateCallMeta = {
  calls?: WorkflowToolCall[];
  durationMs?: number;
  usage?: WorkflowTokenUsage;
};

// A step reports its tool calls and their results/errors separately, joined
// only by `toolCallId`. `toolResults` omits calls that errored, so those are
// recovered from the step's `content` array instead (the only place a
// 'tool-error' part appears).
function collectStepToolCalls(
  step: GenerateTextStep,
  delegateCallMetaByToolCallId: Map<string, DelegateCallMeta> | undefined,
): WorkflowToolCall[] {
  const outputByCallId = new Map(
    step.toolResults.map((result) => [result.toolCallId, result.output]),
  );
  const errorByCallId = new Map(
    step.content
      .filter(isToolErrorPart)
      .map((part) => [part.toolCallId, formatToolError(part.error)]),
  );

  return step.toolCalls.map((call) => {
    const meta = delegateCallMetaByToolCallId?.get(call.toolCallId);
    return {
      toolName: call.toolName,
      input: call.input,
      output: outputByCallId.get(call.toolCallId),
      error: errorByCallId.get(call.toolCallId),
      calls: meta?.calls,
      durationMs: meta?.durationMs,
      usage: meta?.usage,
    };
  });
}

// Maps a generateText run's steps to the node's trace: one entry per AI SDK
// step, carrying the step's commentary text, token usage, and tool calls.
// Steps with neither text nor tool calls (can happen on the final step) are
// dropped, they add nothing to the run view.
//
// `delegateCallMetaByToolCallId` lets the team executor attach a delegate
// call's member tool calls, duration, and usage; callers that don't pass it
// (the agent executor) get plain tool calls with none of that.
export function collectTrace(
  steps: GenerateTextSteps,
  delegateCallMetaByToolCallId?: Map<string, DelegateCallMeta>,
): WorkflowAgentTraceStep[] {
  const trace: WorkflowAgentTraceStep[] = [];

  for (const step of steps) {
    const toolCalls = collectStepToolCalls(step, delegateCallMetaByToolCallId);
    const text = step.text.length > 0 ? step.text : undefined;
    if (text === undefined && toolCalls.length === 0) {
      continue;
    }
    trace.push({ text, usage: toWorkflowUsage(step.usage), toolCalls });
  }

  return trace;
}

// Streams each finished loop step to the debug log so a long run can be
// followed live; the persisted trace only lands once the whole node
// completes. Same shape as the stored trace entries.
export function logTraceStepDebug(
  scope: string,
  delegateCallMetaByToolCallId?: Map<string, DelegateCallMeta>,
): (step: GenerateTextStep) => void {
  return (step) => {
    const toolCalls = collectStepToolCalls(step, delegateCallMetaByToolCallId);
    const text = step.text.length > 0 ? step.text : undefined;
    if (text === undefined && toolCalls.length === 0) {
      return;
    }
    logger.debug(`Trace step: ${scope}`, {
      text,
      usage: toWorkflowUsage(step.usage),
      toolCalls,
    });
  };
}

export type ReferencedAgentRun = {
  text: string;
  trace: WorkflowAgentTraceStep[];
  usage: WorkflowTokenUsage;
};

// Pre-run gate, shared by every LLM call a workflow run makes on a user's
// behalf: the agent node's referenced-agent path, its inline default-agent
// path, the team node's lead call, and each team member's delegate call
// (docs/credits/prd.md: "Every text LLM call made on a user's behalf in
// chat and workflows debits their credit account"). Returns null both when
// credits are off (skipped entirely, no query) and when the billing entity
// has no account; either way the caller's later settleWorkflowUsage call
// must also skip, so gating and settling can never happen independently.
export async function gateCreditSpend({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<CreditSpendState | null> {
  if (!config.creditsEnabled) {
    return null;
  }

  const spendState = await resolveCreditSpendState({ workspaceId });
  if (!spendState?.allowed) {
    throw new InsufficientCreditsError(workspaceId);
  }

  return spendState;
}

// Post-run settlement, paired with gateCreditSpend above. `spendState` is
// whatever the matching gate call returned: null short-circuits this to a
// no-op, so a caller can always call both unconditionally without its own
// creditsEnabled check.
//
// The agent's output is already final by the time this runs; a settlement
// failure (a transient DB error, say) must not throw away a completed run
// over a bookkeeping problem, same reasoning as the chat path
// (docs/credits/prd.md, "Settlement transaction"). A dropped charge is a
// reconciliation bug to fix later, not a reason to fail the node.
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
  // Identifies the charge for settlement's idempotencyKey and
  // refType/refId: the run and node this call belongs to, plus a per-call
  // discriminator. Stable across a BullMQ retry of this same run/node/call,
  // since runId and nodeId don't change across attempts. callId varies by
  // caller: a fixed constant for calls that happen once per node ('agent',
  // 'lead'), or the AI SDK's own per-call toolCallId for a team node's
  // several member delegate calls.
  runId: string;
  nodeId: string;
  callId: string;
  durationMs: number;
}): Promise<void> {
  if (!spendState) {
    return;
  }

  try {
    await settleCreditUsage({
      creditAccountId: spendState.creditAccountId,
      workspaceId,
      userId,
      aiModelId,
      feature,
      refType: 'workflowRun',
      refId: runId,
      durationMs,
      idempotencyKey: `workflow:${runId}:${nodeId}:${callId}`,
      ...normalizeUsage(provider, steps),
    });
  } catch (error) {
    logger.error(
      `Failed to settle credit usage for workflow run ${runId}, node ${nodeId}, call ${callId}:`,
      error,
    );
  }
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
  const spendState = await gateCreditSpend({ workspaceId });

  const agentRecord = await getAgentById({ agentId, userId });
  if (!agentRecord) {
    throw new Error(`Agent "${agentId}" not found for this user`);
  }
  const agent = withAgentConfig(agentRecord);
  const instructions = await buildAgentInstructions({
    agentId,
    userId,
    tools: agent.tools,
    systemPrompt: agent.systemPrompt,
    context: agent.context,
    defaultDatasetId: agentRecord.defaultDatasetId,
  });

  const startedAt = Date.now();
  const result = await generateText({
    model: getLanguageModel({ provider: agent.aiModel.provider, model: agent.aiModel.model }),
    instructions,
    prompt,
    tools: buildAgentToolset(agent.tools, noopWriter, {
      userId,
      agentId,
      workspaceId,
      // Workflows already run inside the worker process and need the video
      // to exist before downstream steps run, so the video-gen tool awaits
      // the render inline instead of the chat fire-and-forget path
      // (docs/videogen/prd.md decision 2).
      awaitGeneration: true,
    }),
    // A plan-executing agent node can exhaust the chat-level step budget
    // immediately (schema read + row list + work + row update already
    // costs 4), see docs/datasets.md decision 6. Flat 15 for every workflow
    // agent run; chat is unaffected and stays at 5 above.
    stopWhen: stepCountIs(15),
    onStepFinish: logTraceStepDebug(`agent "${agentRecord.name}"`),
    ...toModelSettings(agent.settings),
  });

  await settleWorkflowUsage({
    spendState,
    workspaceId,
    userId,
    aiModelId: agentRecord.aiModelId,
    provider: agent.aiModel.provider,
    steps: result.steps,
    feature,
    runId,
    nodeId,
    callId,
    durationMs: Date.now() - startedAt,
  });

  return {
    text: result.text,
    trace: collectTrace(result.steps),
    usage: toWorkflowUsage(result.usage),
  };
}
