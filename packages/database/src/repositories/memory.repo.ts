import { eq } from 'drizzle-orm';
import { db } from '../db';
import type { AgentMemory } from '../schema';
import { agentMemory } from '../schema';

export async function getMemoryByAgentId({
  agentId,
}: {
  agentId: string;
}): Promise<AgentMemory | null> {
  const [memory] = await db
    .select()
    .from(agentMemory)
    .where(eq(agentMemory.agentId, agentId))
    .limit(1);

  return memory ?? null;
}

export async function upsertMemory({
  agentId,
  content,
}: {
  agentId: string;
  content: string;
}): Promise<AgentMemory> {
  const [memory] = await db
    .insert(agentMemory)
    .values({ agentId, content })
    .onConflictDoUpdate({
      target: agentMemory.agentId,
      set: { content },
    })
    .returning();

  if (!memory) {
    throw new Error('Failed to upsert agent memory');
  }

  return memory;
}
