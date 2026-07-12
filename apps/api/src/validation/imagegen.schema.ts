import * as z from 'zod';

export const imageGenProviders = ['bfl', 'google-vertex', 'openai'] as const;
export const imageGenAspectRatios = ['1:1', '4:3', '16:9'] as const;
export const imageGenResolutions = ['1K', '2K'] as const;

export const generateImagesSchema = z.object({
  prompt: z.string().min(1).max(5000),
  provider: z.enum(imageGenProviders),
  model: z.string().min(1).max(255),
  resolution: z.enum(imageGenResolutions).optional(),
  aspectRatio: z.enum(imageGenAspectRatios).optional(),
  n: z.number().int().min(1).max(4).optional(),
  seed: z.number().int().optional(),
  negativePrompt: z.string().max(5000).optional(),
});

export type GenerateImagesInput = z.infer<typeof generateImagesSchema>;
