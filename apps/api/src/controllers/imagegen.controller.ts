import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { createGenImages, getGenImagesForUser } from '../services/imagen.service';

export const imageGenerateController = new Hono()
  .basePath('/image/generate')
  .use(authMiddleware)
  /**
   * [GET] /image/generate
   * Get all generated images for the authenticated user.
   */
  .get('/', async (c) => {
    const user = c.get('user');

    const images = await getGenImagesForUser({ userId: user.id });

    return c.json({ images });
  })
  /**
   * [POST] /image/generate
   * Generate new image(s) based on the provided prompt and options for the authenticated user.
   */
  .post('/', async (c) => {
    const user = c.get('user');
    const body = await c.req.json();

    const { images } = await createGenImages({
      userId: user.id,
      prompt: body.prompt,
      provider: body.provider,
      model: body.model,
      resolution: body.resolution,
      aspectRatio: body.aspectRatio,
      n: body.n,
      seed: body.seed,
      negativePrompt: body.negativePrompt,
    });

    return c.json({ images });
  });
