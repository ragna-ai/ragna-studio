import { generateText, getLanguageModel } from '@repo/ai';
import { getDefaultAgent } from '@repo/database';
import type { AgentConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import { runReferencedAgent, withAiModel } from './run-referenced-agent';
import type { Executor } from './types';

export const executeAgent: Executor = async (node, ctx) => {
  const config = node.data.config as AgentConfig;
  const prompt = resolveTemplate(config.prompt, ctx);

  // A referenced agent runs exactly like it does in chat: same tool loop,
  // temperature, and step budget (see chat.controller.ts). Inline nodes
  // (no agentId) have no tools/settings to run with, so they stay plain.
  if (!config.agentId) {
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
  }

  const { text, trace } = await runReferencedAgent({
    agentId: config.agentId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    prompt,
  });

  return { output: text, trace: trace.length > 0 ? trace : undefined };
};
