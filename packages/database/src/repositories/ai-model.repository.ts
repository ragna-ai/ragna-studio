import { eq } from 'drizzle-orm';
import { db } from '../db';
import { aiModel, type AiModel } from '../schema';
import type { ICreateAiModel, IUpdateAiModel } from '../zod';

export async function createAiModel(values: ICreateAiModel): Promise<AiModel> {
  const [createdAiModel] = await db.insert(aiModel).values(values).returning();

  if (!createdAiModel) {
    throw new Error('Failed to create AI model');
  }

  return createdAiModel;
}

export async function getAiModelById({
  aiModelId,
}: {
  aiModelId: string;
}): Promise<AiModel | null> {
  const aiModelRecord = await db.query.aiModel.findFirst({
    where: eq(aiModel.id, aiModelId),
  });

  return aiModelRecord || null;
}

export async function getAllAiModels(): Promise<AiModel[]> {
  const aiModels = await db.query.aiModel.findMany();
  return aiModels;
}

export async function updateAiModel(params: IUpdateAiModel): Promise<AiModel> {
  const { id: aiModelId, ...updateData } = params;

  if (!aiModelId) {
    throw new Error('AI Model ID is required for update');
  }

  const [updatedAiModel] = await db
    .update(aiModel)
    .set(updateData)
    .where(eq(aiModel.id, aiModelId))
    .returning();

  if (!updatedAiModel) {
    throw new Error('Failed to update AI model');
  }

  return updatedAiModel;
}
