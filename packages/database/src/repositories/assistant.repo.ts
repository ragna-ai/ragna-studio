import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Assistant } from '../schema';
import { assistant } from '../schema';
import type { ICreateAssistant, IUpdateAssistant } from '../zod';
import { getDefaultAssistant } from './default-assistant.repo';

export async function upsertAssistant(
  values: ICreateAssistant & { id?: string },
): Promise<Assistant> {
  const {
    id: assistantId,
    userId,
    name,
    description,
    aiModelId,
    isDefault,
    systemPrompt,
    tools,
  } = values;
  const [createdAssistant] = await db
    .insert(assistant)
    .values({
      id: assistantId,
      userId,
      aiModelId,
      isDefault,
      name,
      description,
      systemPrompt,
      tools,
    })
    .onConflictDoUpdate({
      target: assistant.id,
      set: {
        aiModelId,
        name,
        description,
        systemPrompt,
        tools,
      },
    })
    .returning();

  if (!createdAssistant) {
    throw new Error('Failed to create assistant');
  }

  return createdAssistant;
}

// Get the user's personal clone of the default assistant, creating it on first use
export async function getOrCreateDefaultAssistantForUser({
  userId,
}: {
  userId: string;
}): Promise<Assistant> {
  const existingAssistant = await db.query.assistant.findFirst({
    where: { userId, isDefault: true },
  });

  if (existingAssistant) {
    return existingAssistant;
  }

  const defaultAssistant = await getDefaultAssistant();

  return upsertAssistant({
    userId,
    aiModelId: defaultAssistant.aiModelId,
    isDefault: true,
    name: defaultAssistant.name,
    description: defaultAssistant.description,
    systemPrompt: defaultAssistant.systemPrompt,
    tools: defaultAssistant.tools,
  });
}

export async function getAssistantCountByUserId({ userId }: { userId: string }): Promise<number> {
  return db.$count(assistant, eq(assistant.userId, userId));
}

export async function getAssistantById({
  assistantId,
  userId,
}: {
  assistantId: string;
  userId: string;
}): Promise<Assistant | null> {
  const assistantRecord = await db.query.assistant.findFirst({
    where: { id: assistantId, userId: userId },
    with: {
      aiModel: true,
    },
  });

  return assistantRecord || null;
}

export async function getAllAssistantsByUserId({
  userId,
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}) {
  const assistants = await db.query.assistant.findMany({
    columns: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { userId: userId },
    with: {
      aiModel: {
        columns: {
          provider: true,
          displayName: true,
        },
      },
    },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.updatedAt) : desc(t.updatedAt)),
  });

  return assistants;
}

export async function updateAssistant(params: IUpdateAssistant): Promise<Assistant> {
  const { id: assistantId, ...updateData } = params;

  if (!assistantId) {
    throw new Error('Assistant ID is required for update');
  }

  const [updatedAssistant] = await db
    .update(assistant)
    .set(updateData)
    .where(eq(assistant.id, assistantId))
    .returning();

  if (!updatedAssistant) {
    throw new Error('Failed to update assistant');
  }

  return updatedAssistant;
}

// DELETE an assistant by ID
export async function deleteAssistantById({
  assistantId,
  userId,
}: {
  assistantId: string;
  userId: string;
}): Promise<void> {
  await db
    .delete(assistant)
    .where(and(eq(assistant.id, assistantId), eq(assistant.userId, userId)));
}
