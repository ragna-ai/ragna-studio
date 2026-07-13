import { generateText, getLanguageModel } from '@repo/ai';
import { getAgentById, getDefaultAgent } from '@repo/database';
import type { AgentConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import type { Executor } from './types';

type AiModelRef = { provider: string; model: string };

// getAgentById/getDefaultAgent both load the `aiModel` relation, but their
// declared return types don't carry it (see agent.repo.ts). Narrow locally
// instead of widening the shared repo types.
function withAiModel<T>(record: T): T & { aiModel: AiModelRef } {
  return record as T & { aiModel: AiModelRef };
}

// Plain generateText, no tool calls: tools are their own node type.
export const executeAgent: Executor = async (node, ctx) => {
  const config = node.data.config as AgentConfig;
  const prompt = resolveTemplate(config.prompt, ctx);

  let systemPrompt = config.systemPrompt;
  let modelRef: AiModelRef;

  if (config.agentId) {
    const agentRecord = await getAgentById({ agentId: config.agentId, userId: ctx.userId });
    if (!agentRecord) {
      throw new Error(`Agent "${config.agentId}" not found for this user`);
    }
    const agentWithModel = withAiModel(agentRecord);
    systemPrompt = agentWithModel.systemPrompt;
    modelRef = agentWithModel.aiModel;
  } else {
    const defaultAgent = withAiModel(await getDefaultAgent());
    modelRef = defaultAgent.aiModel;
  }

  const { text } = await generateText({
    model: getLanguageModel({ provider: modelRef.provider, model: modelRef.model }),
    instructions: systemPrompt,
    prompt,
  });

  return text;
};
