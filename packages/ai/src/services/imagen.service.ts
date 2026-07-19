import type { BlackForestLabsImageProviderOptions } from '@ai-sdk/black-forest-labs';
import type { GoogleVertexImageProviderOptions } from '@ai-sdk/google-vertex';
import type { OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import type { GenImage } from '@repo/database';
import { createGenImageRecords, getDefaultAiModelByModality } from '@repo/database';
import { logger } from '@repo/logger';
import { buildImageUrls, getImgGenBucketNameForUser, uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { generateImage } from 'ai';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import { getImageModel } from '../factories';

export const imageGenProviders = ['bfl', 'google-vertex', 'openai'] as const;
export const imageGenAspectRatios = ['1:1', '4:3', '16:9'] as const;
export const imageGenResolutions = ['1K', '2K'] as const;

// workspaceId is not part of the request body schema: the HTTP endpoint
// takes it from the route (`/workspace/:workspaceId/gen-image`), and the
// chat agent's image tool takes it from the chat. Both pass it separately
// into createGenImages/createGenImagesWithDefaultModel below.
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

type AspectRatio = NonNullable<GenerateImagesInput['aspectRatio']>;
type ImageResolution = NonNullable<GenerateImagesInput['resolution']>;

// workspaceId is required: gen_images.workspaceId is NOT NULL
// (docs/api-standards/prd.md).
type CreateImageParams = GenerateImagesInput & { userId: string; workspaceId: string };

type OpenAIImageSize = '1024x1024' | '1024x1536' | '1536x1024';

const openAiSizeMap: Record<AspectRatio, OpenAIImageSize> = {
  '1:1': '1024x1024',
  '4:3': '1536x1024',
  '16:9': '1536x1024',
};

// @ai-sdk/black-forest-labs validates width/height against the legacy FLUX.1
// API limit (max 1920px per axis) regardless of the model id, so 2K stays at
// 1920 on the long edge rather than BFL's native 2048.
const ratiosResolutionMap = {
  '1:1': {
    '1K': { width: 1024, height: 1024 }, // bflCost: 1MP
    '2K': { width: 1920, height: 1920 }, // bflCost: ~3.7MP
  },
  '4:3': {
    '1K': { width: 1024, height: 768 }, // bflCost: 1MP
    '2K': { width: 1920, height: 1440 }, // bflCost: ~2.8MP
  },
  '16:9': {
    '1K': { width: 1024, height: 576 }, // bflCost: 1MP
    '2K': { width: 1920, height: 1080 }, // bflCost: ~2.1MP
  },
};

function getDimensionsFromResolutionAndAspectRatio(
  resolution: ImageResolution,
  aspectRatio: AspectRatio,
): { width: number; height: number } {
  let width = 1024;
  let height = 1024;

  if (ratiosResolutionMap[aspectRatio]?.[resolution]) {
    width = ratiosResolutionMap[aspectRatio][resolution].width;
    height = ratiosResolutionMap[aspectRatio][resolution].height;
  }

  return { width, height };
}

/**
 * Create an image using the specified AI model and provider
 */
export async function createGenImages({
  userId,
  workspaceId,
  prompt,
  provider,
  model,
  resolution = '1K',
  aspectRatio = '1:1',
  n = 1,
  seed = undefined,
  negativePrompt = undefined,
}: CreateImageParams) {
  type GenerateImageParams = Parameters<typeof generateImage>[0];
  type GenerateImageProviderOptions = GenerateImageParams['providerOptions'];

  // SDK expects Record<string, JSONObject> but typed provider options lack index signatures;
  // a single cast from unknown bridges the gap without losing satisfies validation at the call sites.
  const toProviderOptions = (opts: unknown): GenerateImageProviderOptions =>
    opts as GenerateImageProviderOptions;

  const configProviderParams = (): Pick<
    GenerateImageParams,
    'aspectRatio' | 'size' | 'providerOptions'
  > => {
    switch (provider) {
      case 'bfl': {
        const { width, height } = getDimensionsFromResolutionAndAspectRatio(
          resolution,
          aspectRatio,
        );
        return {
          aspectRatio,
          providerOptions: toProviderOptions({
            blackForestLabs: {
              width,
              height,
              outputFormat: 'png',
              promptUpsampling: false,
            } satisfies BlackForestLabsImageProviderOptions,
          }),
        };
      }
      case 'google-vertex': {
        return {
          aspectRatio,
          providerOptions: toProviderOptions({
            vertex: {
              negativePrompt,
              addWatermark: false,
              personGeneration: 'allow_all',
              safetySetting: 'block_medium_and_above',
              sampleImageSize: resolution === '1K' ? '1K' : '2K',
            } satisfies GoogleVertexImageProviderOptions,
          }),
        };
      }
      case 'openai': {
        return {
          size: openAiSizeMap[aspectRatio],
          providerOptions: toProviderOptions({
            openai: {
              quality: resolution === '2K' ? 'high' : 'medium',
              outputFormat: 'png',
            } satisfies OpenAIImageModelGenerationOptions,
          }),
        };
      }
      default:
        return {};
    }
  };

  // generate image(s)
  const { error: imageGenError, data: imageGenResult } = await tryCatch(() =>
    generateImage({
      model: getImageModel({
        provider,
        model,
      }),
      prompt,
      n,
      seed,
      ...configProviderParams(),
    }),
  );

  if (imageGenError !== null || !imageGenResult) {
    logger.error('Image generation failed', { imageGenError });
    throw new Error('Image generation failed');
  }

  const { images: genImages } = imageGenResult;

  const { bucketName, prefix } = getImgGenBucketNameForUser(userId);

  const uploadPromises = genImages.map((image) => {
    return uploadObjectBuffer({
      bucketName,
      key: `${prefix}/${randomUUID()}.png`,
      buffer: image.uint8Array,
      contentType: 'image/png',
    });
  });

  // upload images to bucket
  const { error: uploadError, data: uploadData } = await tryCatch(() =>
    Promise.all(uploadPromises),
  );

  if (uploadError !== null || !uploadData) {
    logger.error('Failed to upload generated images', { uploadError });
    throw new Error('Failed to upload generated images');
  }

  // persist the generation so prompt and settings can be shown later
  const { error: recordError, data: records } = await tryCatch(() =>
    createGenImageRecords(
      uploadData.map(({ key }) => ({
        userId,
        workspaceId,
        storageKey: key,
        prompt,
        provider,
        model,
        aspectRatio,
        resolution,
        seed,
        negativePrompt,
      })),
    ),
  );

  if (recordError !== null || !records) {
    logger.error('Failed to save generated image records', { recordError });
    throw new Error('Failed to save generated images');
  }

  return { images: records.map(toGenImageDto) };
}

type CreateImagesWithDefaultModelParams = {
  userId: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  n?: number;
  workspaceId: string;
};

/**
 * Create images with the first configured image model.
 * Used by the chat agent's image generation tool, where the user picks no model.
 */
export async function createGenImagesWithDefaultModel({
  userId,
  prompt,
  aspectRatio,
  n,
  workspaceId,
}: CreateImagesWithDefaultModelParams) {
  const { error, data: imageModel } = await tryCatch(() =>
    getDefaultAiModelByModality({ modality: 'image' }),
  );

  if (error !== null || !imageModel || !isImageGenProvider(imageModel.provider)) {
    logger.error('No image generation model available', { error });
    throw new Error('No image generation model available');
  }

  return createGenImages({
    userId,
    prompt,
    aspectRatio,
    n,
    provider: imageModel.provider,
    model: imageModel.model,
    workspaceId,
  });
}

function isImageGenProvider(provider: string): provider is GenerateImagesInput['provider'] {
  return (imageGenProviders as readonly string[]).includes(provider);
}

function toGenImageDto(record: GenImage) {
  return {
    id: record.id,
    prompt: record.prompt,
    createdAt: record.createdAt,
    ...buildImageUrls({ userId: record.userId, key: record.storageKey }),
  };
}
