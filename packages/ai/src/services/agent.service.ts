import { getMemoryByAgentId } from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';

type BuildInstructionsInput = {
  agentId: string;
  tools: string[];
  systemPrompt: string;
};

// Loads the agent's saved memory document, or undefined when there is nothing
// to inject. Each reason to skip is its own early return so they stay
// distinguishable when debugging:
//   - the agent does not have the `memory` tool enabled,
//   - the read failed (logged, not thrown: memory enhances a chat, it is not
//     core to answering, so a failed lookup degrades to the plain prompt),
//   - the agent has no saved memory yet.
async function loadAgentMemoryContent(agentId: string, tools: string[]): Promise<string | undefined> {
  if (!tools.includes('memory')) {
    return undefined;
  }

  const { data: memory, error } = await tryCatch(() => getMemoryByAgentId({ agentId }));
  if (error !== null) {
    logger.warn('Failed to load agent memory', error);
    return undefined;
  }

  return memory?.content ?? undefined;
}

// Appends the agent's saved memory document to its system prompt, verbatim.
function buildInstructions(systemPrompt: string, memoryContent: string | undefined): string {
  if (!memoryContent) {
    return systemPrompt;
  }

  const memoryBlock = `<memory>\nNotes you have saved about this user and their work. Treat them as background knowledge.\n\n${memoryContent}\n</memory>`;

  return `${systemPrompt}\n\n${memoryBlock}`;
}

// Builds the system prompt for a chat turn, injecting the agent's memory when
// the `memory` tool is enabled and there is something saved.
export async function buildAgentInstructions({
  agentId,
  tools,
  systemPrompt,
}: BuildInstructionsInput): Promise<string> {
  const memoryContent = await loadAgentMemoryContent(agentId, tools);
  return buildInstructions(systemPrompt, memoryContent);
}
