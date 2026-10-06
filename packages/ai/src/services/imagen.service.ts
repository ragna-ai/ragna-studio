import type { BlackForestLabsImageProviderOptions } from '@ai-sdk/black-forest-labs';
import type { GoogleVertexImageProviderOptions } from '@ai-sdk/google-vertex';
import type { OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { config } from '@repo/config';
import type { GenImage, GenImageWithMedia, Media } from '@repo/database';
import {
  createGenImageRecords,
  createGenImageReferences,
  createMedia,
  getDefaultAiModelByModality,
  getGenImageRowsByIds,
  updateGenImageStatus,
  updateGenImageStatusByIds,
} from '@repo/database';
import type { AiModel, GenImageReferenceOrigin } from '@repo/database/schema';
import { logger } from '@repo/logger';
import { applyImageWatermark } from '@repo/media';
import { GEN_IMAGES_JOB, genImagesJobSchema, queue } from '@repo/queue';
import {
  toPublicMediaUrl,
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
// into requestGenImages/createGenImagesWithDefaultModel below.
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

type GenerateImageParams = Parameters<typeof generateImage>[0];
type GenerateImageProviderOptions = GenerateImageParams['providerOptions'];

// SDK expects Record<string, JSONObject> but the typed provider options lack
// an index signature; a single cast from unknown bridges the gap without
// losing satisfies validation at the call site below (mirrors
// videogen.service.ts's toProviderOptions).
const toProviderOptions = (opts: unknown): GenerateImageProviderOptions =>
  opts as GenerateImageProviderOptions;

type GenImageReferenceDto = { origin: GenImageReferenceOrigin; imgUrl: string };

// Widened for the preview dialog (docs/imagegen/prd.md): it shows the
// settings behind a generation and can load them back into the form, so the
// dto needs to carry those settings, not just the prompt and image URLs.
// status/error and the optional urls mirror videogen.service.ts's
// GenVideoDto: imgUrl is undefined until the row completes
// (docs/imagegen/worker-execution-prd.md decision 7).
export type GenImageDto = {
  id: string;
  status: GenImage['status'];
  error: string | null;
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
  imgUrl?: string;
};

// media is only set for a completed row; every call site below hands in a
// just-inserted pending row, a just-failed row, or (from runGenImages) a
// completed row with its freshly created media, so the default keeps
// imgUrl undefined for the first two.
function toGenImageDto(
  record: GenImage,
  media: Media | null,
  referenceImageDtos: GenImageReferenceDto[],
): GenImageDto {
  return {
    id: record.id,
    status: record.status,
    error: record.error,
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
    imgUrl: media ? toPublicMediaUrl(media.storageKey) : undefined,
  };
}

// Built once per request from the already-resolved reference input (mediaId
// + storageKey), not re-derived from the DB: every row in a batch shares the
// same reference set (docs/media-library/migration-prd.md decision 6), so
// this only needs to run once, the same way the pre-split createGenImages did.
function buildReferenceImageDtos(
  referenceImages: GenerateImagesInput['referenceImages'],
): GenImageReferenceDto[] {
  return (referenceImages ?? []).map((reference) => ({
    origin: reference.origin,
    imgUrl: toPublicMediaUrl(reference.storageKey),
  }));
}

/**
 * Inserts a batch of pending gen_images rows (one per requested output) plus
 * their shared gen_image_reference rows, and reads them back joined with
 * their reference media (docs/imagegen/worker-execution-prd.md decision 2):
 * a request creates up to 4 outputs from one prompt/settings/reference set,
 * so the batch is n rows sharing everything except their eventual mediaId.
 * Exported standalone (not just used by requestGenImages below) for the
 * inline workflow path: createGenImagesWithDefaultModel calls this, then
 * runGenImages, with no queue hop, mirroring createGenVideoRecord.
 */
export async function createGenImageBatch(params: CreateImageParams): Promise<GenImageWithMedia[]> {
  const {
    userId,
    workspaceId,
    prompt,
    provider,
    model,
    resolution = '1K',
    aspectRatio = '1:1',
    n = 1,
    seed,
    negativePrompt,
    referenceImages,
    visibleWatermark = false,
  } = params;

  const records = await createGenImageRecords(
    Array.from({ length: n }, () => ({
      userId,
      workspaceId,
      status: 'pending',
      mediaId: null,
      prompt,
      provider,
      model,
      aspectRatio,
      resolution,
      seed,
      negativePrompt,
      visibleWatermark,
    })),
  );

  if (referenceImages && referenceImages.length > 0) {
    await createGenImageReferences(
      records.flatMap((record) =>
        referenceImages.map((reference, sortOrder) => ({
          genImageId: record.id,
          mediaId: reference.mediaId,
          origin: reference.origin,
          sortOrder,
        })),
      ),
    );
  }

  return getGenImageRowsByIds({ ids: records.map((record) => record.id) });
}

/**
 * Enqueues the gen-images job for an already-inserted batch, or marks every
 * row in it failed if queueing itself fails (e.g. Redis is down), mirroring
 * gen-video's enqueueGenVideoJob. Shared by requestGenImages below and
 * (indirectly, through it) the chat tool's enqueue-then-poll path.
 */
async function enqueueGenImagesJob(
  records: GenImageWithMedia[],
  referenceImageDtos: GenImageReferenceDto[],
): Promise<GenImageDto[]> {
  const genImageIds = records.map((record) => record.id);

  const { error } = await tryCatch(() =>
    queue.genImages().add(GEN_IMAGES_JOB, genImagesJobSchema.parse({ genImageIds })),
  );

  if (error === null) {
    return records.map((record) => toGenImageDto(record, record.media, referenceImageDtos));
  }

  logger.error('Failed to enqueue gen-images job', { error, genImageIds });

  const failed = await updateGenImageStatusByIds({
    ids: genImageIds,
    status: 'failed',
    error: 'Failed to enqueue image generation',
  });

  return failed.map((record) => toGenImageDto(record, null, referenceImageDtos));
}

/**
 * Request side (API, chat tool, docs/imagegen/worker-execution-prd.md
 * decision 3): inserts the pending batch and enqueues the gen-images job,
 * then returns immediately. The worker (gen-images.processor.ts) does the
 * slow part.
 */
export async function requestGenImages(params: CreateImageParams): Promise<GenImageDto[]> {
  const records = await createGenImageBatch(params);
  const referenceImageDtos = buildReferenceImageDtos(params.referenceImages);

  return enqueueGenImagesJob(records, referenceImageDtos);
}

interface GeneratedImageUpload {
  storageKey: string;
  size: number;
  // The actual outcome of this image's upload, not the request: true only
  // when the watermark attempt below both ran and succeeded
  // (docs/ai-labeling/prd.md "Failure semantics"). runGenImages persists
  // this onto that image's own gen_images.visibleWatermark.
  visibleWatermark: boolean;
}

/**
 * Runs the provider call for one batch and uploads every output
 * (docs/imagegen/worker-execution-prd.md decision 2): all rows in the batch
 * share prompt/settings/provider/model/references (set once at request
 * time), so this reads them off the batch's first row rather than each one.
 * The provider call is all-or-nothing: a failure here fails the whole batch,
 * the caller (runGenImages) doesn't need to know which row would have been
 * which. On success, returns one upload result per row, in the same order
 * as `rows` and as the provider's own `images` array.
 */
async function generateAndUploadBatch(rows: GenImageWithMedia[]): Promise<GeneratedImageUpload[]> {
  const [first] = rows;

  if (!first) {
    throw new Error('Gen images batch is empty');
  }

  const { userId, prompt, provider, model, seed, negativePrompt, visibleWatermark } = first;
  // gen_images.resolution/aspectRatio are typed columns ($type<GenImageResolution
  // | GenImageAspectRatio>, genimage.schema.ts), structurally identical to
  // this package's own ImageResolution/AspectRatio aliases, so no cast is
  // needed to satisfy configProviderParams below.
  const resolution: ImageResolution = first.resolution ?? '1K';
  const aspectRatio: AspectRatio = first.aspectRatio ?? '1:1';

  const configProviderParams = (): Pick<
    GenerateImageParams,
    'aspectRatio' | 'size' | 'seed' | 'providerOptions' | 'maxImagesPerCall'
  > => {
    switch (provider) {
      case 'bfl': {
        const { width, height } = getDimensionsFromResolutionAndAspectRatio(
          resolution,
          aspectRatio,
        );
        return {
          aspectRatio,
          seed: seed ?? undefined,
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
        // @ai-sdk/google-vertex 5.0.63+ dropped Imagen entirely: image
        // requests now go through Gemini's generateContent, which has no
        // addWatermark or negativePrompt option. That's fine for the EU AI
        // Act Art. 50(2) guardrail (docs/ai-labeling/prd.md part 1):
        // Gemini image models apply SynthID unconditionally, with no
        // API-level toggle to disable it.
        if (negativePrompt) {
          logger.warn(
            'negativePrompt dropped for Vertex: Gemini image models have no equivalent option',
            {
              provider,
              model,
            },
          );
        }

        // Gemini image models don't honor seed for reproducible output.
        if (seed !== null) {
          logger.warn(
            'Seed dropped for Vertex Gemini image models: not supported for reproducible output',
            {
              provider,
              model,
            },
          );
        }

        return {
          aspectRatio,
          seed: undefined,
          // doGenerate throws for n > 1, so fan the batch out into one call
          // per image instead of one call for the whole batch.
          maxImagesPerCall: 1,
          providerOptions: toProviderOptions({
            vertex: {
              imageConfig: {
                imageSize: resolution === '1K' ? '1K' : '2K',
                personGeneration: 'ALLOW_ALL',
              },
              safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                {
                  category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                  threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                {
                  category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                  threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                },
              ],
            } satisfies GoogleVertexImageProviderOptions,
          }),
        };
      }
      case 'openai': {
        return {
          size: openAiSizeMap[aspectRatio],
          seed: seed ?? undefined,
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

  if (first.references.length > 0) {
    const { error: referenceDownloadError, data: referenceBuffers } = await tryCatch(() =>
      Promise.all(
        first.references.map(async (reference) => {
          const { buffer } = await downloadObjectBuffer(
            reference.media.bucket,
            reference.media.storageKey,
          );
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

  const { error: imageGenError, data: imageGenResult } = await tryCatch(() =>
    generateImage({
      model: getImageModel({ provider, model }),
      prompt: generateImagePrompt,
      n: rows.length,
      seed: providerParams.seed,
      aspectRatio: providerParams.aspectRatio,
      size: providerParams.size,
      maxImagesPerCall: providerParams.maxImagesPerCall,
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

  // Best-effort, per image (docs/ai-labeling/prd.md "Failure semantics"): a
  // generated image is always saved, the watermark is an addon. A failed
  // attempt falls back to the raw bytes for that image only, rather than
  // failing the whole batch; the resulting `visibleWatermark` becomes that
  // row's stored value below, recording the outcome, not the request.
  const watermarkResults = await Promise.all(
    genImages.map(async (image) => {
      const buffer = Buffer.from(image.uint8Array);

      if (!visibleWatermark) {
        return { buffer, applied: false };
      }

      const { error, data } = await tryCatch(() =>
        applyImageWatermark({ buffer, mimeType: 'image/png' }),
      );

      if (error !== null || !data) {
        logger.warn('Visible watermark failed, storing raw image instead', { error });
        return { buffer, applied: false };
      }

      return { buffer: data.buffer, applied: true };
    }),
  );

  const { bucketName, prefix } = getImgGenBucketNameForUser(userId);

  const uploads = await Promise.all(
    watermarkResults.map(async ({ buffer, applied }) => {
      const { key } = await uploadObjectBuffer({
        bucketName,
        key: `${prefix}/${randomUUID()}.png`,
        buffer,
        contentType: 'image/png',
      });

      return { storageKey: key, size: buffer.byteLength, visibleWatermark: applied };
    }),
  );

  return uploads;
}

/**
 * Run side (docs/imagegen/worker-execution-prd.md decision 3): loads the
 * batch's rows, flips them all to processing, runs the provider call and
 * uploads every output, creates a media row per output, then flips each row
 * to completed pointing at its own media (or, on any failure, flips every
 * row in the batch to failed with the same message and rethrows, since the
 * provider call is all-or-nothing). Called from the gen-images processor
 * (async path) and the inline workflow path (createGenImagesWithDefaultModel
 * below). Notification enqueueing happens only in the processor, never here.
 */
export async function runGenImages({
  genImageIds,
}: {
  genImageIds: string[];
}): Promise<GenImageWithMedia[]> {
  const rows = await getGenImageRowsByIds({ ids: genImageIds });

  if (rows.length === 0) {
    throw new Error(`No gen images found for ids: ${genImageIds.join(', ')}`);
  }

  await updateGenImageStatusByIds({ ids: genImageIds, status: 'processing' });

  const { error, data: uploads } = await tryCatch(() => generateAndUploadBatch(rows));

  if (error !== null || !uploads) {
    logger.error('Image generation failed', { error, genImageIds });
    await updateGenImageStatusByIds({
      ids: genImageIds,
      status: 'failed',
      error: error?.message ?? 'Image generation failed',
    });
    throw error ?? new Error('Image generation failed');
  }

  // One media row per generated output (docs/media-library/migration-prd.md
  // decision 6), minted before the gen_images rows are flipped to completed
  // so each row's update can point at its own media.id.
  const mediaRows = await Promise.all(
    uploads.map((upload, index) =>
      createMedia({
        ownerWorkspaceId: rows[index].workspaceId,
        bucket: config.s3ImagesBucketName,
        storageKey: upload.storageKey,
        filename: upload.storageKey.split('/').pop() ?? upload.storageKey,
        mimeType: 'image/png',
        size: upload.size,
        origin: 'generated',
      }),
    ),
  );

  const updated = await Promise.all(
    rows.map((row, index) =>
      updateGenImageStatus({
        id: row.id,
        status: 'completed',
        mediaId: mediaRows[index].id,
        // Actual outcome, not the request (docs/ai-labeling/prd.md "Failure
        // semantics"): overwrites the row's requested value with what the
        // upload actually stored, flipping it to false if the watermark
        // attempt failed for that image.
        visibleWatermark: uploads[index].visibleWatermark,
      }),
    ),
  );

  return updated.map((record, index) => ({
    ...record,
    media: mediaRows[index],
    references: rows[index].references,
  }));
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

interface ResolvedDefaultImageModel {
  provider: GenerateImagesInput['provider'];
  model: string;
  capabilities: AiModel['capabilities'];
}

/**
 * Resolves the first configured image model, shared by
 * createGenImagesWithDefaultModel and requestGenImagesWithDefaultModel
 * below: both need the same default-model lookup, they only differ in
 * whether the generation itself runs inline or through the queue.
 */
async function resolveDefaultImageModel(): Promise<ResolvedDefaultImageModel> {
  const { error, data: imageModel } = await tryCatch(() =>
    getDefaultAiModelByModality({ modality: 'image' }),
  );

  if (error !== null || !imageModel || !isImageGenProvider(imageModel.provider)) {
    logger.error('No image generation model available', { error });
    throw new Error('No image generation model available');
  }

  return {
    provider: imageModel.provider,
    model: imageModel.model,
    capabilities: imageModel.capabilities,
  };
}

/**
 * Creates images with the first configured image model and runs them inline
 * (docs/imagegen/worker-execution-prd.md decision 6): used by the image
 * generation tool when it already runs inside the worker (workflow
 * executors), so there's no queue hop, mirroring the video tool's awaited
 * path (createGenVideoRecord + runGenVideo).
 *
 * The tool's inputSchema offers seed/negativePrompt unconditionally (the
 * agent has no way to read ai_models.capabilities), so this is where they
 * get dropped for a model that doesn't support them: fail closed, an absent
 * or false flag means unsupported (docs/imagegen/prd.md decisions 1 and 7).
 * No reference images here, the tool never offers them.
 */
export async function createGenImagesWithDefaultModel(
  params: CreateImagesWithDefaultModelParams,
): Promise<GenImageWithMedia[]> {
  const { provider, model, capabilities } = await resolveDefaultImageModel();

  const rows = await createGenImageBatch({
    ...params,
    seed: capabilities?.supportsSeed ? params.seed : undefined,
    negativePrompt: capabilities?.supportsNegativePrompt ? params.negativePrompt : undefined,
    provider,
    model,
  });

  return runGenImages({ genImageIds: rows.map((row) => row.id) });
}

/**
 * Same as createGenImagesWithDefaultModel, but through the request side
 * (docs/imagegen/worker-execution-prd.md decision 6): used by the chat-path
 * image tool when it runs in the API process, so generation still happens on
 * the worker. The tool polls the returned ids until they settle or the poll
 * cap is reached.
 */
export async function requestGenImagesWithDefaultModel(
  params: CreateImagesWithDefaultModelParams,
): Promise<GenImageDto[]> {
  const { provider, model, capabilities } = await resolveDefaultImageModel();

  return requestGenImages({
    ...params,
    seed: capabilities?.supportsSeed ? params.seed : undefined,
    negativePrompt: capabilities?.supportsNegativePrompt ? params.negativePrompt : undefined,
    provider,
    model,
  });
}

function isImageGenProvider(provider: string): provider is GenerateImagesInput['provider'] {
  return (imageGenProviders as readonly string[]).includes(provider);
}
