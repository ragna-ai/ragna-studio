import {
  buildAgentInstructions,
  buildAgentToolset,
  generateText,
  getLanguageModel,
  stepCountIs,
  toModelSettings,
} from '@repo/ai';
import type { AgentSettings, AgentTools } from '@repo/database';
import { getAgentById } from '@repo/database';
import { logger } from '@repo/logger';
import type { WorkflowAgentTraceStep, WorkflowTokenUsage, WorkflowToolCall } from '@repo/workflow';
import { noopWriter } from './noop-writer';

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

// Runs a referenced agent exactly like it does in chat: same instructions,
// full toolset (noop writer, workflow runs have no chat UI to stream to),
// temperature, and step budget. Shared by the agent node (one agent) and
// the team node (each member, run once per delegate call).
export async function runReferencedAgent({
  agentId,
  userId,
  workspaceId,
  prompt,
}: {
  agentId: string;
  userId: string;
  workspaceId: string | null;
  prompt: string;
}): Promise<ReferencedAgentRun> {
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

  const result = await generateText({
    model: getLanguageModel({ provider: agent.aiModel.provider, model: agent.aiModel.model }),
    instructions,
    prompt,
    tools: buildAgentToolset(agent.tools, noopWriter, { userId, agentId, workspaceId }),
    // A plan-executing agent node can exhaust the chat-level step budget
    // immediately (schema read + row list + work + row update already
    // costs 4), see docs/datasets.md decision 6. Flat 15 for every workflow
    // agent run; chat is unaffected and stays at 5 above.
    stopWhen: stepCountIs(15),
    onStepFinish: logTraceStepDebug(`agent "${agentRecord.name}"`),
    ...toModelSettings(agent.settings),
  });

  return {
    text: result.text,
    trace: collectTrace(result.steps),
    usage: toWorkflowUsage(result.usage),
  };
}
