import type { BlackForestLabsImageProviderOptions } from '@ai-sdk/black-forest-labs';
import type { GoogleVertexImageProviderOptions } from '@ai-sdk/google-vertex';
import type { OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { config } from '@repo/config';
import type { GenImage, GenImageReference } from '@repo/database';
import { createGenImageRecords, getDefaultAiModelByModality } from '@repo/database';
import { logger } from '@repo/logger';
import {
  buildImageUrls,
  downloadObjectBuffer,
  getImgGenBucketNameForUser,
  uploadObjectBuffer,
} from '@repo/storage';
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
//
// This is the service-level schema: it takes already-resolved storage keys.
// The HTTP-level schema (apps/api) additionally accepts a genImageId and
// resolves it to a storage key before calling in here, same split as
// generateVideoSchema vs validGenerateVideoBody (docs/imagegen/prd.md).
export const generateImagesSchema = z.object({
  prompt: z.string().min(1).max(5000),
  provider: z.enum(imageGenProviders),
  model: z.string().min(1).max(255),
  resolution: z.enum(imageGenResolutions).optional(),
  aspectRatio: z.enum(imageGenAspectRatios).optional(),
  n: z.number().int().min(1).max(4).optional(),
  seed: z.number().int().optional(),
  negativePrompt: z.string().max(5000).optional(),
  // bfl + openai only (docs/imagegen/prd.md decision 3); enforcing that is
  // capability-driven and lives in apps/api, not here (see the vertex
  // branch of configProviderParams below).
  referenceImages: z
    .array(
      z.object({
        origin: z.enum(['upload', 'genImage']),
        storageKey: z.string().min(1),
      }),
    )
    .max(4)
    .optional(),
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
  referenceImages = undefined,
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
        // Reference images never reach this branch in practice: apps/api
        // rejects them for any model without ai_models.capabilities
        // .supportsReferenceImages, and vertex ships with that flag unset
        // (docs/imagegen/prd.md decision 3). That gate lives outside
        // @repo/ai, so it's worth spelling out why a vertex request built
        // with referenceImages anyway would be dangerous rather than just
        // unsupported: @ai-sdk/google-vertex maps the SDK's unified
        // `prompt: { images }` to Imagen's edit endpoint with a hardcoded
        // `editMode: 'EDIT_MODE_INPAINT_INSERTION'`, i.e. maskless
        // inpainting, not the subject/style conditioning bfl and openai
        // give us. Nothing below reads referenceImages, so there is
        // nothing to disable here; this comment is the guardrail.
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

  // AI SDK v7 accepts `prompt` as a plain string, or as `{ text, images }`
  // to condition the generation on reference images. Only switching to the
  // object form when references are present keeps the no-reference path
  // byte-identical to before this feature existed.
  let generateImagePrompt: GenerateImageParams['prompt'] = prompt;

  if (referenceImages && referenceImages.length > 0) {
    const { error: referenceDownloadError, data: referenceBuffers } = await tryCatch(() =>
      Promise.all(
        referenceImages.map(async ({ storageKey }) => {
          const { buffer } = await downloadObjectBuffer(config.cfImagesBucketName, storageKey);
          return buffer;
        }),
      ),
    );

    if (referenceDownloadError !== null || !referenceBuffers) {
      logger.error('Failed to download reference images', { referenceDownloadError });
      throw new Error('Failed to download reference images');
    }

    generateImagePrompt = { text: prompt, images: referenceBuffers };
  }

  // generate image(s)
  const { error: imageGenError, data: imageGenResult } = await tryCatch(() =>
    generateImage({
      model: getImageModel({
        provider,
        model,
      }),
      prompt: generateImagePrompt,
      n,
      seed,
      ...configProviderParams(),
    }),
  );

  if (imageGenError !== null || !imageGenResult) {
    logger.error('Image generation failed', { imageGenError });
    throw new Error('Image generation failed');
  }

  // Surfaces provider-side quirks like OpenAI silently ignoring `seed`
  // (docs/imagegen/prd.md decision 6): a capability row that disagrees with
  // what the SDK actually supports should be visible in the logs, not just
  // silently honoured or dropped.
  if (imageGenResult.warnings.length > 0) {
    logger.warn('Image generation returned warnings', {
      provider,
      model,
      warnings: imageGenResult.warnings,
    });
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
        referenceImages: referenceImages ?? [],
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
  seed?: number;
  negativePrompt?: string;
  workspaceId: string;
};

/**
 * Create images with the first configured image model.
 * Used by the chat agent's image generation tool, where the user picks no model.
 *
 * The tool's inputSchema offers seed/negativePrompt unconditionally (the
 * agent has no way to read ai_models.capabilities), so this is where they
 * get dropped for a model that doesn't support them: fail closed, an absent
 * or false flag means unsupported (docs/imagegen/prd.md decisions 1 and 7).
 * No reference images here, the tool never offers them.
 */
export async function createGenImagesWithDefaultModel({
  userId,
  prompt,
  aspectRatio,
  n,
  seed,
  negativePrompt,
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
    seed: imageModel.capabilities?.supportsSeed ? seed : undefined,
    negativePrompt: imageModel.capabilities?.supportsNegativePrompt ? negativePrompt : undefined,
    provider: imageModel.provider,
    model: imageModel.model,
    workspaceId,
  });
}

function isImageGenProvider(provider: string): provider is GenerateImagesInput['provider'] {
  return (imageGenProviders as readonly string[]).includes(provider);
}

type GenImageReferenceDto = { origin: GenImageReference['origin']; imgUrl: string };

// Reference thumbnails resolve through buildImageUrls the same way the
// generated image itself does: it works for any key regardless of prefix,
// so 'upload' and 'genImage' references (different owners, same bucket)
// need no special-casing here.
function toGenImageReferenceDto(
  reference: GenImageReference,
  userId: string,
): GenImageReferenceDto {
  return {
    origin: reference.origin,
    imgUrl: buildImageUrls({ userId, key: reference.storageKey }).imgUrl,
  };
}

// Widened for the preview dialog (docs/imagegen/prd.md): it shows the
// settings behind a generation and can load them back into the form, so the
// dto needs to carry those settings, not just the prompt and image URLs.
function toGenImageDto(record: GenImage) {
  return {
    id: record.id,
    prompt: record.prompt,
    createdAt: record.createdAt,
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    seed: record.seed,
    negativePrompt: record.negativePrompt,
    provider: record.provider,
    model: record.model,
    referenceImages: record.referenceImages.map((reference) =>
      toGenImageReferenceDto(reference, record.userId),
    ),
    ...buildImageUrls({ userId: record.userId, key: record.storageKey }),
  };
}
