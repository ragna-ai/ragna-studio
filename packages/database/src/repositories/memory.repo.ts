import { eq } from 'drizzle-orm';
import { db } from '../db';
import { AgentLockedError } from '../errors';
import type { AgentMemory } from '../schema';
import { agent, agentMemory } from '../schema';

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

/** Same as `upsertMemory`, for a user's edit: refused on a locked agent. The agent's own tool uses `upsertMemory`. */
export async function upsertMemoryWhileUnlocked({
  agentId,
  content,
}: {
  agentId: string;
  content: string;
}): Promise<AgentMemory> {
  return db.transaction(async (tx) => {
    const [agentRow] = await tx
      .select({ lockedVersionId: agent.lockedVersionId })
      .from(agent)
      .where(eq(agent.id, agentId))
      .for('share');
    if (agentRow?.lockedVersionId) throw new AgentLockedError();

    const [memory] = await tx
      .insert(agentMemory)
      .values({ agentId, content })
      .onConflictDoUpdate({ target: agentMemory.agentId, set: { content } })
      .returning();
    if (!memory) throw new Error('Failed to upsert agent memory');
    return memory;
  });
}
