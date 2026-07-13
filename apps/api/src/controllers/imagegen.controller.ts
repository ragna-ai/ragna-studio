import { createGenImages, getGenImagesForUser } from '@repo/ai';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { InternalServerErrorException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validGenerateImagesBody } from '../middlewares/validationMiddlewares';

export const imageGenerateController = new Hono()
  .basePath('/image/generate')
  .use(authMiddleware)
  /**
   * [GET] /image/generate
   * Get all generated images for the authenticated user.
   */
  .get('/', async (c) => {
    const user = c.get('user');

    const { error, data: images } = await tryCatch(() => getGenImagesForUser({ userId: user.id }));

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
      createGenImages({ userId: user.id, ...body }),
    );

    if (error !== null || !generated) {
      throw new InternalServerErrorException('Image generation failed');
    }

    return c.json({ images: generated.images });
  });
