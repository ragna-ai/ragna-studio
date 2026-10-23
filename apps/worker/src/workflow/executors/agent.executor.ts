import type { AgentConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import { requireAgentId, runReferencedAgent } from './run-referenced-agent';
import type { Executor } from './types';

export const executeAgent: Executor = async (node, ctx) => {
  const config = node.data.config as AgentConfig;
  const agentId = requireAgentId(config.agentId);
  const prompt = resolveTemplate(config.prompt, ctx);

  // Runs exactly like chat: same tool loop, temperature, and step budget.
  const { text, trace } = await runReferencedAgent({
    agentId,
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
