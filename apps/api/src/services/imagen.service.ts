import type {
  BlackForestLabsImageProviderOptions,
  GoogleVertexImageProviderOptions,
  OpenAIImageModelGenerationOptions,
} from '@repo/ai';
import { generateImage, getImageModel } from '@repo/ai';
import type { GenImage } from '@repo/database';
import { createGenImageRecords, getGenImagesByUserId } from '@repo/database';
import { logger } from '@repo/logger';
import { uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { randomUUID } from 'node:crypto';
import { InternalServerErrorException } from '../exceptions';
import type { GenerateImagesInput } from '../validation';

type AspectRatio = NonNullable<GenerateImagesInput['aspectRatio']>;
type ImageResolution = NonNullable<GenerateImagesInput['resolution']>;

type CreateImageParams = GenerateImagesInput & { userId: string };

type OpenAIImageSize = '1024x1024' | '1024x1536' | '1536x1024';

const openAiSizeMap: Record<AspectRatio, OpenAIImageSize> = {
  '1:1': '1024x1024',
  '4:3': '1536x1024',
  '16:9': '1536x1024',
};

const ratiosResolutionMap = {
  '1:1': {
    '1K': { width: 1024, height: 1024 }, // bflCost: 1MP
    '2K': { width: 2048, height: 2048 }, // bflCost: 4MP
  },
  '4:3': {
    '1K': { width: 1024, height: 768 }, // bflCost: 1MP
    '2K': { width: 2048, height: 1536 }, // bflCost: 3MP
  },
  '16:9': {
    '1K': { width: 1024, height: 576 }, // bflCost: 1MP
    '2K': { width: 2048, height: 1152 }, // bflCost: 3MP
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

export async function getGenImagesForUser({ userId }: { userId: string }) {
  const { error, data: records } = await tryCatch(() => getGenImagesByUserId({ userId }));

  if (error !== null || !records) {
    throw new InternalServerErrorException('Failed to list generated images');
  }

  return records.map(toGenImageDto);
}

/**
 * Create an image using the specified AI model and provider
 */
export async function createGenImages({
  userId,
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
    throw new InternalServerErrorException('Image generation failed');
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
    throw new InternalServerErrorException('Failed to upload generated images');
  }

  // persist the generation so prompt and settings can be shown later
  const { error: recordError, data: records } = await tryCatch(() =>
    createGenImageRecords(
      uploadData.map(({ key }) => ({
        userId,
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
    throw new InternalServerErrorException('Failed to save generated images');
  }

  return { images: records.map(toGenImageDto) };
}

function toGenImageDto(record: GenImage) {
  return {
    id: record.id,
    prompt: record.prompt,
    createdAt: record.createdAt,
    ...buildImageUrls({ userId: record.userId, key: record.storageKey }),
  };
}

function getImgGenBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  const bucketName = 'ragna-cloud-images';
  const prefix = `${userId}/images/generated`;
  return { bucketName, prefix };
}

function buildImageUrls({ userId, key }: { userId: string; key: string }) {
  return {
    rawUrl: `https://ragna-cloud-images.${userId}.r2.cloudflarestorage.com/${key}`,
    imgUrl: `https://images.ragna.app/${key}`,
  };
}
