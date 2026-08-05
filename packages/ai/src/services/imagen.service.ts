import type { BlackForestLabsImageProviderOptions } from '@ai-sdk/black-forest-labs';
import type { GoogleVertexImageProviderOptions } from '@ai-sdk/google-vertex';
import type { OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { config } from '@repo/config';
import type { GenImage } from '@repo/database';
import {
  createGenImageReferences,
  createGenImageRecords,
  createMedia,
  getDefaultAiModelByModality,
} from '@repo/database';
import type { GenImageReferenceOrigin } from '@repo/database/schema';
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
import { applyImageWatermark } from './watermark.service';

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
  //
  // Both mediaId and storageKey travel together (docs/media-library/
  // migration-prd.md): storageKey downloads the bytes to condition the
  // generation on, mediaId is the link this call writes into
  // gen_image_reference once the output rows exist. apps/api's
  // imagegen.service.ts resolves both from the HTTP-level {origin, id}
  // union before calling in here.
  referenceImages: z
    .array(
      z.object({
        origin: z.enum(['upload', 'genImage']),
        mediaId: z.string().min(1),
        storageKey: z.string().min(1),
      }),
    )
    .max(4)
    .optional(),
  // Art. 50(4) visible-disclosure toggle (docs/ai-labeling/prd.md part 2).
  // Default off; applied after generation, before upload, by
  // applyImageWatermark below.
  visibleWatermark: z.boolean().optional(),
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
  visibleWatermark = false,
}: CreateImageParams) {
  type GenerateImageParams = Parameters<typeof generateImage>[0];
  type GenerateImageProviderOptions = GenerateImageParams['providerOptions'];

  // SDK expects Record<string, JSONObject> but typed provider options lack index signatures;
  // a single cast from unknown bridges the gap without losing satisfies validation at the call sites.
  const toProviderOptions = (opts: unknown): GenerateImageProviderOptions =>
    opts as GenerateImageProviderOptions;

  const configProviderParams = (): Pick<
    GenerateImageParams,
    'aspectRatio' | 'size' | 'seed' | 'providerOptions'
  > => {
    switch (provider) {
      case 'bfl': {
        const { width, height } = getDimensionsFromResolutionAndAspectRatio(
          resolution,
          aspectRatio,
        );
        return {
          aspectRatio,
          seed,
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
        //
        // EU AI Act Art. 50(2) guardrail (docs/ai-labeling/prd.md part 1):
        // addWatermark controls Imagen's SynthID marking. Never set it to
        // false here, now or in any future edit of this branch, even to
        // unblock a seed request. Imagen rejects `seed` while addWatermark
        // is on, so the watermark wins: seed is dropped for this provider
        // below instead, the same way OpenAI silently ignores it.
        if (seed !== undefined) {
          logger.warn(
            'Seed dropped for Vertex Imagen: SynthID marking stays on and Imagen rejects seed while it is enabled',
            { provider, model },
          );
        }

        return {
          aspectRatio,
          seed: undefined,
          providerOptions: toProviderOptions({
            vertex: {
              negativePrompt,
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
          seed,
          providerOptions: toProviderOptions({
            openai: {
              quality: resolution === '2K' ? 'high' : 'medium',
              outputFormat: 'png',
            } satisfies OpenAIImageModelGenerationOptions,
          }),
        };
      }
      default:
        return { seed: undefined };
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

  const providerParams = configProviderParams();

  // generate image(s)
  const { error: imageGenError, data: imageGenResult } = await tryCatch(() =>
    generateImage({
      model: getImageModel({
        provider,
        model,
      }),
      prompt: generateImagePrompt,
      n,
      seed: providerParams.seed,
      aspectRatio: providerParams.aspectRatio,
      size: providerParams.size,
      providerOptions: providerParams.providerOptions,
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

  // Explicit user intent (docs/ai-labeling/prd.md "Failure semantics"): a
  // failed watermark step fails the whole generation rather than silently
  // delivering an unlabeled file, so this runs before upload, not after.
  const { error: watermarkError, data: outputBuffers } = await tryCatch(() =>
    Promise.all(
      genImages.map(async (image) => {
        const buffer = Buffer.from(image.uint8Array);

        if (!visibleWatermark) {
          return buffer;
        }

        const { buffer: watermarked } = await applyImageWatermark({
          buffer,
          mimeType: 'image/png',
        });

        return watermarked;
      }),
    ),
  );

  if (watermarkError !== null || !outputBuffers) {
    logger.error('Failed to apply visible watermark', { watermarkError });
    throw new Error('Failed to apply visible watermark');
  }

  const { bucketName, prefix } = getImgGenBucketNameForUser(userId);

  const uploadPromises = outputBuffers.map(async (buffer) => {
    const { key } = await uploadObjectBuffer({
      bucketName,
      key: `${prefix}/${randomUUID()}.png`,
      buffer,
      contentType: 'image/png',
    });

    return { key, size: buffer.byteLength };
  });

  // upload images to bucket
  const { error: uploadError, data: uploadData } = await tryCatch(() =>
    Promise.all(uploadPromises),
  );

  if (uploadError !== null || !uploadData) {
    logger.error('Failed to upload generated images', { uploadError });
    throw new Error('Failed to upload generated images');
  }

  // One media row per generated output (docs/media-library/migration-prd.md
  // decision 6), minted before the gen_images rows so each can point at its
  // own media.id via a not-null FK.
  const { error: mediaError, data: mediaRows } = await tryCatch(() =>
    Promise.all(
      uploadData.map((upload) =>
        createMedia({
          ownerWorkspaceId: workspaceId,
          bucket: bucketName,
          storageKey: upload.key,
          filename: upload.key.split('/').pop() ?? upload.key,
          mimeType: 'image/png',
          size: upload.size,
          origin: 'generated',
        }),
      ),
    ),
  );

  if (mediaError !== null || !mediaRows) {
    logger.error('Failed to save generated image media rows', { mediaError });
    throw new Error('Failed to save generated images');
  }

  // persist the generation so prompt and settings can be shown later
  const { error: recordError, data: records } = await tryCatch(() =>
    createGenImageRecords(
      mediaRows.map((mediaRow) => ({
        userId,
        workspaceId,
        mediaId: mediaRow.id,
        prompt,
        provider,
        model,
        aspectRatio,
        resolution,
        seed,
        negativePrompt,
        visibleWatermark,
      })),
    ),
  );

  if (recordError !== null || !records) {
    logger.error('Failed to save generated image records', { recordError });
    throw new Error('Failed to save generated images');
  }

  // Every created row shares the same reference set (one (genImageId,
  // reference) pair per row, gen-image.repo.ts's createGenImageReferences
  // contract), since a batch request generates several outputs from one
  // set of inputs.
  const { error: referenceError } = await tryCatch(() =>
    createGenImageReferences(
      records.flatMap((record) =>
        (referenceImages ?? []).map((reference, sortOrder) => ({
          genImageId: record.id,
          mediaId: reference.mediaId,
          origin: reference.origin,
          sortOrder,
        })),
      ),
    ),
  );

  if (referenceError !== null) {
    logger.error('Failed to save generated image references', { referenceError });
    throw new Error('Failed to save generated images');
  }

  const referenceImageDtos: GenImageReferenceDto[] = (referenceImages ?? []).map((reference) => ({
    origin: reference.origin,
    imgUrl: buildImageUrls({ userId, key: reference.storageKey }).imgUrl,
  }));

  return {
    // records and mediaRows come from the same 1:1 mapping above, so
    // record[i]'s output object is always mediaRows[i]'s storage key.
    images: records.map((record, index) =>
      toGenImageDto({ record, storageKey: mediaRows[index].storageKey, referenceImageDtos }),
    ),
  };
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

type GenImageReferenceDto = { origin: GenImageReferenceOrigin; imgUrl: string };

// Widened for the preview dialog (docs/imagegen/prd.md): it shows the
// settings behind a generation and can load them back into the form, so the
// dto needs to carry those settings, not just the prompt and image URLs.
export type GenImageDto = {
  id: string;
  prompt: string;
  createdAt: Date;
  aspectRatio: string | null;
  resolution: string | null;
  seed: number | null;
  negativePrompt: string | null;
  visibleWatermark: boolean;
  provider: string;
  model: string;
  referenceImages: GenImageReferenceDto[];
  rawUrl: string;
  imgUrl: string;
};

// Every row from one createGenImages call shares the same reference set
// (docs/media-library/migration-prd.md decision 6), so the caller builds
// the reference DTOs once and passes them in rather than this function
// re-deriving them per record; storageKey is likewise passed in since a
// plain GenImage row (from createGenImageRecords) carries only mediaId, not
// the joined media row's storage key.
function toGenImageDto({
  record,
  storageKey,
  referenceImageDtos,
}: {
  record: GenImage;
  storageKey: string;
  referenceImageDtos: GenImageReferenceDto[];
}): GenImageDto {
  const { rawUrl, imgUrl } = buildImageUrls({ userId: record.userId, key: storageKey });

  return {
    id: record.id,
    prompt: record.prompt,
    createdAt: record.createdAt,
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    seed: record.seed,
    negativePrompt: record.negativePrompt,
    visibleWatermark: record.visibleWatermark,
    provider: record.provider,
    model: record.model,
    referenceImages: referenceImageDtos,
    rawUrl,
    imgUrl,
  };
}
