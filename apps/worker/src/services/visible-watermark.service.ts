import { config } from '@repo/config';
import { completeGenImages, completeGenVideo, toLabeledStorageKey } from '@repo/ai';
import type { StoredGenImage } from '@repo/ai';
import { getGenImageRowsByIds, getGenVideoById } from '@repo/database';
import { logger } from '@repo/logger';
import { applyImageWatermark, applyVideoWatermark } from '@repo/media-transform';
import type { VisibleWatermarkImageOutput, VisibleWatermarkJobData } from '@repo/queue';
import { deleteObjects, downloadObjectBuffer, uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';

export interface WatermarkTransforms {
  applyImageWatermark: typeof applyImageWatermark;
  applyVideoWatermark: typeof applyVideoWatermark;
}

export const defaultWatermarkTransforms: WatermarkTransforms = {
  applyImageWatermark,
  applyVideoWatermark,
};

export interface WatermarkStepParams<Kind extends VisibleWatermarkJobData['kind']> {
  data: Extract<VisibleWatermarkJobData, { kind: Kind }>;
  isLastAttempt: boolean;
  transforms: WatermarkTransforms;
}

export interface WatermarkStepResult {
  completed: boolean;
}

interface LabeledOutput {
  image: StoredGenImage;
  rawKey: string | null;
}

async function deleteRawObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const { error } = await tryCatch(() => deleteObjects(config.s3ImagesBucketName, keys));
  if (error !== null) {
    logger.warn('Failed to delete unlabeled objects', { error, keys });
  }
}

async function labelImage(
  output: VisibleWatermarkImageOutput,
  transforms: WatermarkTransforms,
): Promise<StoredGenImage> {
  const raw = await downloadObjectBuffer(config.s3ImagesBucketName, output.storageKey);
  const labeled = await transforms.applyImageWatermark({
    buffer: raw.buffer,
    mimeType: output.mimeType,
  });

  const { key } = await uploadObjectBuffer({
    bucketName: config.s3ImagesBucketName,
    key: toLabeledStorageKey(output.storageKey),
    buffer: labeled.buffer,
    contentType: output.mimeType,
  });

  return {
    storageKey: key,
    mimeType: output.mimeType,
    size: labeled.buffer.byteLength,
    visibleWatermark: true,
  };
}

/**
 * Labels every still-processing image of the batch and completes the rows. A failed
 * image throws so BullMQ retries; on the last attempt only the failed images keep
 * their raw output, the labeled ones keep their badge.
 */
export async function watermarkGenImages({
  data,
  isLastAttempt,
  transforms,
}: WatermarkStepParams<'image'>): Promise<WatermarkStepResult> {
  const rows = await getGenImageRowsByIds({ ids: data.genImageIds });
  const pending = rows.filter((row) => row.status === 'processing');

  if (pending.length === 0) {
    logger.info(`Gen images ${data.genImageIds.join(', ')} already completed, skipping watermark`);
    return { completed: false };
  }

  const results = await Promise.all(
    pending.map(async (row): Promise<LabeledOutput> => {
      const output = data.outputs.find((candidate) => candidate.genImageId === row.id);
      if (!output) {
        throw new Error(`No stored output for gen image ${row.id}`);
      }

      const { error, data: image } = await tryCatch(() => labelImage(output, transforms));
      if (error === null && image) {
        return { image, rawKey: output.storageKey };
      }

      if (!isLastAttempt) {
        throw error ?? new Error(`Visible watermark failed for gen image ${row.id}`);
      }

      logger.warn('Visible watermark failed on the last attempt, storing raw image instead', {
        error,
        genImageId: row.id,
      });
      return {
        image: {
          storageKey: output.storageKey,
          mimeType: output.mimeType,
          size: output.size,
          visibleWatermark: false,
        },
        rawKey: null,
      };
    }),
  );

  await completeGenImages({ rows: pending, images: results.map((result) => result.image) });

  const rawKeys = results.flatMap((result) => (result.rawKey ? [result.rawKey] : []));
  await deleteRawObjects(rawKeys);

  return { completed: true };
}

async function labelVideo(
  data: WatermarkStepParams<'video'>['data'],
  transforms: WatermarkTransforms,
): Promise<{ storageKey: string; size: number }> {
  const raw = await downloadObjectBuffer(config.s3ImagesBucketName, data.storageKey);
  const labeled = await transforms.applyVideoWatermark({ buffer: raw.buffer });

  const { key } = await uploadObjectBuffer({
    bucketName: config.s3ImagesBucketName,
    key: toLabeledStorageKey(data.storageKey),
    buffer: labeled.buffer,
    contentType: data.mimeType,
  });

  return { storageKey: key, size: labeled.buffer.byteLength };
}

/**
 * Labels the stored video and completes the row. A failure throws so BullMQ retries;
 * on the last attempt the raw video becomes the final output without the badge.
 */
export async function watermarkGenVideo({
  data,
  isLastAttempt,
  transforms,
}: WatermarkStepParams<'video'>): Promise<WatermarkStepResult> {
  const record = await getGenVideoById({ id: data.genVideoId });

  if (!record) {
    throw new Error(`Gen video ${data.genVideoId} not found`);
  }

  if (record.status !== 'processing') {
    logger.info(`Gen video ${data.genVideoId} already completed, skipping watermark`);
    return { completed: false };
  }

  const { error, data: labeled } = await tryCatch(() => labelVideo(data, transforms));

  if (error === null && labeled) {
    await completeGenVideo({
      record,
      storageKey: labeled.storageKey,
      size: labeled.size,
      draftCacheKey: data.draftCacheKey,
      visibleWatermark: true,
    });
    await deleteRawObjects([data.storageKey]);
    return { completed: true };
  }

  if (!isLastAttempt) {
    throw error ?? new Error(`Visible watermark failed for gen video ${record.id}`);
  }

  logger.warn('Visible watermark failed on the last attempt, storing raw video instead', {
    error,
    genVideoId: record.id,
  });
  await completeGenVideo({
    record,
    storageKey: data.storageKey,
    size: data.size,
    draftCacheKey: data.draftCacheKey,
    visibleWatermark: false,
  });

  return { completed: true };
}
