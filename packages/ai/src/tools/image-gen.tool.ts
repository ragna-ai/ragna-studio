import { tryCatch } from '@repo/utils';
import type {
  InferToolInput,
  InferToolOutput,
  InferUITool,
  Tool,
  UIMessage,
  UIMessageStreamWriter,
} from 'ai';
import { tool } from 'ai';
import * as z from 'zod';
import { createGenImagesWithDefaultModel, imageGenAspectRatios } from '../services/imagen.service';

const imageGenInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(5000)
    .describe(
      'A detailed description of the image to generate. Prefer fluent english language using your own words.',
    ),
  aspectRatio: z
    .enum(imageGenAspectRatios)
    .optional()
    .describe('The aspect ratio of the image. Defaults to 1:1.'),
  n: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe('The number of images to generate. Defaults to 1.'),
});

type ImageGenInput = z.infer<typeof imageGenInputSchema>;

export type GeneratedAgentImage = {
  id: string;
  imgUrl: string;
};

type ImageGenOutput = { images: GeneratedAgentImage[] } | { error: string };

export const getGeneratedImages = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<ImageGenInput, ImageGenOutput> =>
  tool({
    description:
      'Use this tool to generate one or more images from a text prompt. It returns URLs of the generated images, which are also shown to the user directly.',
    inputSchema: imageGenInputSchema,
    execute: async (input) => {
      // emit tool usage message
      writer.write({
        type: 'data-imageGen',
        data: { prompt: input.prompt },
        transient: true,
      });

      const { error, data: generated } = await tryCatch(
        () => createGenImagesWithDefaultModel({ ...input, userId, workspaceId }),
        { retryOnFailure: false },
      );

      if (error !== null || generated === null) {
        return { error: 'Image generation failed. Service currently unavailable.' };
      }

      // only id and URL go back into the model context; the full record stays in the DB
      return { images: generated.images.map(({ id, imgUrl }) => ({ id, imgUrl })) };
    },
  });

export type getGeneratedImagesInput = InferToolInput<ReturnType<typeof getGeneratedImages>>;
export type getGeneratedImagesOutput = InferToolOutput<ReturnType<typeof getGeneratedImages>>;
export type ImageGenUiTool = InferUITool<ReturnType<typeof getGeneratedImages>>;
