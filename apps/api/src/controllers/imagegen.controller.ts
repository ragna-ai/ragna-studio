import { createGenImages } from '@repo/ai';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { InternalServerErrorException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validGenerateImagesBody,
  validWorkspaceIdQuery,
} from '../middlewares/validationMiddlewares';
import { getGenImagesForUser } from '../services/imagegen.service';

export const imageGenerateController = new Hono()
  .basePath('/image/generate')
  .use(authMiddleware)
  /**
   * [GET] /image/generate
   * Get all generated images for the authenticated user.
   */
  .get('/', validWorkspaceIdQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const unassigned = query.unassigned === 'true';

    const { error, data: images } = await tryCatch(() =>
      getGenImagesForUser({ userId: user.id, workspaceId: query.workspaceId, unassigned }),
    );

    if (error !== null || !images) {
      throw new InternalServerErrorException('Failed to list generated images');
    }

    return c.json({ images });
  })
  /**
   * [POST] /image/generate
   * Generate new image(s) based on the provided prompt and options for the authenticated user.
   */
  .post('/', validGenerateImagesBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const { error, data: generated } = await tryCatch(() =>
      createGenImages({
        userId: user.id,
        prompt: body.prompt,
        provider: body.provider,
        model: body.model,
        resolution: body.resolution,
        aspectRatio: body.aspectRatio,
        n: body.n,
        seed: body.seed,
        negativePrompt: body.negativePrompt,
        workspaceId: body.workspaceId,
      }),
    );

    if (error !== null || !generated) {
      throw new InternalServerErrorException('Image generation failed');
    }

    return c.json({ images: generated.images });
  });
