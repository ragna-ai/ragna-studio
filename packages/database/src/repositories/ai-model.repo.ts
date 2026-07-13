import { eq } from 'drizzle-orm';
import { db } from '../db';
import { aiModel, type AiModel, type AiModelModality } from '../schema';
import type { AiModelCreateSchema, AiModelUpdateSchema } from '../zod';

export async function createAiModel(payload: AiModelCreateSchema): Promise<AiModel> {
  const [createdAiModel] = await db.insert(aiModel).values(payload).returning();

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
    where: { id: aiModelId },
  });

  return aiModelRecord || null;
}

export async function getDefaultAiModelByModality({
  modality,
}: {
  modality: AiModelModality;
}): Promise<AiModel | null> {
  const aiModelRecord = await db.query.aiModel.findFirst({
    where: { modality },
  });

  return aiModelRecord || null;
}

export async function getAllAiModels(): Promise<AiModel[]> {
  const aiModels = await db.query.aiModel.findMany();
  return aiModels;
}

export async function updateAiModel(params: AiModelUpdateSchema): Promise<AiModel> {
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
