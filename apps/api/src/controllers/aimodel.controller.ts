import { getAllAiModels } from '@repo/database';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { NotFoundException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';

export const aiModelController = new Hono()
  .basePath('/aimodel')
  .use(authMiddleware)
  /**
   * [GET] /aimodel/list
   * Get all AI models
   */
  .get('/list', async (c) => {
    // Fetch all AI models from the database
    const { error, data: aiModels } = await tryCatch(() => getAllAiModels());

    if (error !== null || !aiModels) {
      throw new NotFoundException('AI Models not found');
    }

    const uniqueProviders = Array.from(new Set(aiModels.map((model) => model.provider)));

    const providers = uniqueProviders.map((provider) => ({
      id: provider,
      displayName: provider.charAt(0).toUpperCase() + provider.slice(1),
    }));

    return c.json({ models: aiModels, providers });
  });
