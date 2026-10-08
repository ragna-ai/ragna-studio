import {
  generateText,
  getLanguageModel,
  withCachedInstructions,
  withDefaultProviderOptions,
} from '@repo/ai';
import { getDefaultAgent } from '@repo/database';
import type { AgentConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import {
  gateCreditSpend,
  runReferencedAgent,
  settleWorkflowUsage,
  withAiModel,
} from './run-referenced-agent';
import type { Executor } from './types';

export const executeAgent: Executor = async (node, ctx) => {
  const config = node.data.config as AgentConfig;
  const prompt = resolveTemplate(config.prompt, ctx);

  // A referenced agent runs exactly like it does in chat: same tool loop,
  // temperature, and step budget (see chat.controller.ts). Inline nodes
  // (no agentId) have no tools/settings to run with, so they stay plain,
  // but it is still an LLM call spent on the user's behalf, so it is gated
  // and charged the same as the referenced-agent path below.
  if (!config.agentId) {
    const defaultAgent = withAiModel(await getDefaultAgent());
    // Gated after the default agent (and its model's pricing) is known, so
    // an unpriced model is refused here rather than at the end of a run.
    const spendState = await gateCreditSpend({
      workspaceId: ctx.workspaceId,
      pricing: defaultAgent.aiModel.pricing,
    });

    const startedAt = Date.now();
    const result = await generateText({
      model: getLanguageModel({
        provider: defaultAgent.aiModel.provider,
        model: defaultAgent.aiModel.model,
      }),
      instructions: withCachedInstructions(config.systemPrompt),
      prompt,
      providerOptions: withDefaultProviderOptions(),
    });

    await settleWorkflowUsage({
      spendState,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      aiModelId: defaultAgent.aiModelId,
      provider: defaultAgent.aiModel.provider,
      steps: result.steps,
      feature: 'workflow',
      runId: ctx.runId,
      nodeId: node.id,
      // One call per node, same as the referenced-agent path.
      callId: 'agent',
      durationMs: Date.now() - startedAt,
    });

    return { output: result.text };
  }

  const { text, trace } = await runReferencedAgent({
    agentId: config.agentId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    prompt,
    runId: ctx.runId,
    nodeId: node.id,
    // One call per agent node, so a fixed suffix is enough to make the
    // idempotencyKey unique per node.
    callId: 'agent',
    feature: 'workflow',
  });

  return { output: text, trace: trace.length > 0 ? trace : undefined };
};
