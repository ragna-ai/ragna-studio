import type { generateText } from '@repo/ai';
import { logger } from '@repo/logger';
import type { WorkflowAgentTraceStep, WorkflowTokenUsage, WorkflowToolCall } from '@repo/workflow';

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;
export type GenerateTextSteps = GenerateTextResult['steps'];
export type GenerateTextStep = GenerateTextSteps[number];
type GenerateTextContentPart = GenerateTextStep['content'][number];
type GenerateTextUsage = GenerateTextResult['usage'];
type ToolErrorPart = Extract<GenerateTextContentPart, { type: 'tool-error' }>;

function isToolErrorPart(part: GenerateTextContentPart): part is ToolErrorPart {
  return part.type === 'tool-error';
}

function formatToolError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toWorkflowUsage(usage: GenerateTextUsage): WorkflowTokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

// Metadata a delegate call attaches to its own tool-call entry once the
// member run it triggered has finished: the member's own tool calls (kept
// flat, not a nested trace), how
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
export function collectStepToolCalls(
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
