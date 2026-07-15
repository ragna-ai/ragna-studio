import {
  buildAgentInstructions,
  generateText,
  getLanguageModel,
  stepCountIs,
  tools,
} from '@repo/ai';
import { getAgentById, getDefaultAgent } from '@repo/database';
import type { AgentConfig, WorkflowToolCall } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import { noopWriter } from './noop-writer';
import type { Executor } from './types';

type AiModelRef = { provider: string; model: string };
type AgentSettingsRef = { temperature?: number; maxOutputTokens?: number } | null;

// getAgentById/getDefaultAgent both load the `aiModel` relation, but their
// declared return types don't carry it (see agent.repo.ts). Narrow locally
// instead of widening the shared repo types.
function withAiModel<T>(record: T): T & { aiModel: AiModelRef } {
  return record as T & { aiModel: AiModelRef };
}

// Same narrowing as withAiModel, widened for the agentId path, which also
// needs the agent's own `tools`/`settings` columns to run it like chat does.
function withAgentConfig<T>(
  record: T,
): T & { aiModel: AiModelRef; tools: string[]; settings: AgentSettingsRef } {
  return record as T & { aiModel: AiModelRef; tools: string[]; settings: AgentSettingsRef };
}

type GenerateTextSteps = Awaited<ReturnType<typeof generateText>>['steps'];
type GenerateTextContentPart = GenerateTextSteps[number]['content'][number];
type ToolErrorPart = Extract<GenerateTextContentPart, { type: 'tool-error' }>;

function isToolErrorPart(part: GenerateTextContentPart): part is ToolErrorPart {
  return part.type === 'tool-error';
}

function formatToolError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Each step reports its tool calls and their results/errors separately,
// joined only by `toolCallId`. `toolResults` omits calls that errored, so
// those are recovered from the step's `content` array instead (the only
// place a 'tool-error' part appears).
function collectToolCalls(steps: GenerateTextSteps): WorkflowToolCall[] {
  const toolCalls: WorkflowToolCall[] = [];

  for (const step of steps) {
    const outputByCallId = new Map(
      step.toolResults.map((result) => [result.toolCallId, result.output]),
    );
    const errorByCallId = new Map(
      step.content
        .filter(isToolErrorPart)
        .map((part) => [part.toolCallId, formatToolError(part.error)]),
    );

    for (const call of step.toolCalls) {
      toolCalls.push({
        toolName: call.toolName,
        input: call.input,
        output: outputByCallId.get(call.toolCallId),
        error: errorByCallId.get(call.toolCallId),
      });
    }
  }

  return toolCalls;
}

export const executeAgent: Executor = async (node, ctx) => {
  const config = node.data.config as AgentConfig;
  const prompt = resolveTemplate(config.prompt, ctx);

  // A referenced agent runs exactly like it does in chat: same tool loop,
  // temperature, and step budget (see chat.controller.ts). Inline nodes
  // (no agentId) have no tools/settings to run with, so they stay plain.
  if (config.agentId) {
    const agentRecord = await getAgentById({ agentId: config.agentId, userId: ctx.userId });
    if (!agentRecord) {
      throw new Error(`Agent "${config.agentId}" not found for this user`);
    }
    const agent = withAgentConfig(agentRecord);
    const instructions = await buildAgentInstructions({
      agentId: config.agentId,
      tools: agent.tools,
      systemPrompt: agent.systemPrompt,
    });

    const result = await generateText({
      model: getLanguageModel({ provider: agent.aiModel.provider, model: agent.aiModel.model }),
      instructions,
      prompt,
      tools: tools(noopWriter, { userId: ctx.userId, agentId: config.agentId }),
      activeTools: agent.tools,
      stopWhen: stepCountIs(5),
      temperature: agent.settings?.temperature ?? 0.7,
      maxOutputTokens: agent.settings?.maxOutputTokens,
    });

    const toolCalls = collectToolCalls(result.steps);

    return { output: result.text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  const defaultAgent = withAiModel(await getDefaultAgent());

  const { text } = await generateText({
    model: getLanguageModel({
      provider: defaultAgent.aiModel.provider,
      model: defaultAgent.aiModel.model,
    }),
    instructions: config.systemPrompt,
    prompt,
  });

  return { output: text };
};
