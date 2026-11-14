import { resizeImageToSquareWebp } from '@repo/media-transform';
import { getGenImageRowsByIds, getGenVideoById } from '@repo/database';
import {
  APPLY_VISIBLE_WATERMARK_JOB,
  GEN_IMAGES_JOB,
  GEN_VIDEO_JOB,
  NOTIFY_USER_JOB,
  visibleWatermarkJobSchema,
} from '@repo/queue';
import {
  deleteObjectsMock,
  enqueuedJobs,
  imageModelGenerateMock,
  queueAddMock,
  resetProviderMocks,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processGenImagesJob } from '../../src/processors/gen-images.processor';
import { processGenVideoJob } from '../../src/processors/gen-video.processor';
import { processVisibleWatermarkJob } from '../../src/processors/visible-watermark.processor';
import type { WatermarkTransforms } from '../../src/services/visible-watermark.service';
import { defaultWatermarkTransforms } from '../../src/services/visible-watermark.service';
import { seedGenImageBatch, seedGenVideo } from '../support/generation-fixtures';
import { useInMemoryStorage } from '../support/in-memory-storage';
import type { InMemoryStorage } from '../support/in-memory-storage';
import { buildJob } from '../support/job';

/** Solid red PNG, 32 x 32 pixels. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAA1BMVEX/AAAZ4gk3AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQ4y2NgGAWjYBSMAuwAAAQgAAFWu83mAAAAAElFTkSuQmCC';
const RAW_IMAGE = await resizeImageToSquareWebp({
  buffer: Buffer.from(Buffer.from(PNG_BASE64, 'base64')),
  size: 400,
});

const LABELED_SUFFIX = Buffer.from('-labeled');

const fakeTransforms: WatermarkTransforms = {
  applyImageWatermark: defaultWatermarkTransforms.applyImageWatermark,
  applyVideoWatermark: ({ buffer }) =>
    Promise.resolve({ buffer: Buffer.concat([buffer, LABELED_SUFFIX]) }),
};

const failingTransforms: WatermarkTransforms = {
  applyImageWatermark: () => Promise.reject(new Error('sharp exploded')),
  applyVideoWatermark: () => Promise.reject(new Error('ffmpeg exploded')),
};

function useRealPngImages(): void {
  imageModelGenerateMock.mockImplementation((options) =>
    Promise.resolve({
      images: Array.from({ length: options.n }, () => new Uint8Array(RAW_IMAGE)),
      warnings: [],
      response: { timestamp: new Date(), modelId: 'fake-image-model', headers: undefined },
    }),
  );
}

function watermarkJobData() {
  const [call] = enqueuedJobs(APPLY_VISIBLE_WATERMARK_JOB);
  return visibleWatermarkJobSchema.parse(call?.[1]);
}

function watermarkJob(attemptsMade = 0) {
  return buildJob({
    name: APPLY_VISIBLE_WATERMARK_JOB,
    data: watermarkJobData(),
    attempts: 3,
    attemptsMade,
  });
}

function successNotifications() {
  return enqueuedJobs(NOTIFY_USER_JOB).filter(([, payload]) =>
    JSON.stringify(payload).includes('_succeeded'),
  );
}

describe('visible watermark job', () => {
  let storage: InMemoryStorage;

  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
    storage = useInMemoryStorage();
  });

  describe('images', () => {
    async function generateLabeledBatch(count = 2) {
      useRealPngImages();
      const seeded = await seedGenImageBatch({ count, visibleWatermark: true });
      const genImageIds = seeded.rows.map((row) => row.id);
      await processGenImagesJob(buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds } }));
      return { ...seeded, genImageIds };
    }

    test('generation with the label on keeps rows processing and hands off', async () => {
      const { genImageIds } = await generateLabeledBatch();

      const rows = await getGenImageRowsByIds({ ids: genImageIds });
      const data = watermarkJobData();
      expect(rows.map((row) => row.status)).toEqual(['processing', 'processing']);
      expect(rows.every((row) => row.media === null)).toBe(true);
      expect(data.kind).toBe('image');
      expect(data.kind === 'image' ? data.outputs : []).toHaveLength(2);
      expect(
        data.kind === 'image' && data.outputs.every((o) => o.storageKey.includes('/unlabeled/')),
      ).toBe(true);
      expect(enqueuedJobs(APPLY_VISIBLE_WATERMARK_JOB)[0]?.[2]).toMatchObject({ attempts: 3 });
      expect(successNotifications()).toHaveLength(0);
    });

    test('a successful job stores the labeled images, drops the raw ones and notifies once', async () => {
      const { genImageIds } = await generateLabeledBatch();

      await processVisibleWatermarkJob(watermarkJob());

      const rows = await getGenImageRowsByIds({ ids: genImageIds });
      expect(rows.map((row) => row.status)).toEqual(['completed', 'completed']);
      expect(rows.every((row) => row.visibleWatermark)).toBe(true);
      for (const row of rows) {
        const stored = storage.objects.get(row.media?.storageKey ?? '');
        expect(row.media?.storageKey).not.toContain('/unlabeled/');
        expect(stored?.equals(RAW_IMAGE)).toBe(false);
      }
      expect([...storage.objects.keys()].some((key) => key.includes('/unlabeled/'))).toBe(false);
      expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
      expect(successNotifications()).toHaveLength(1);
    });

    test('the last failed attempt stores the raw images, unlabeled, and notifies', async () => {
      const { genImageIds } = await generateLabeledBatch();

      const result = await processVisibleWatermarkJob(watermarkJob(2), failingTransforms);

      const rows = await getGenImageRowsByIds({ ids: genImageIds });
      expect(result).toEqual({ success: true });
      expect(rows.map((row) => row.status)).toEqual(['completed', 'completed']);
      expect(rows.every((row) => row.visibleWatermark === false)).toBe(true);
      expect(rows.every((row) => row.media?.storageKey.includes('/unlabeled/'))).toBe(true);
      expect(successNotifications()).toHaveLength(1);
    });

    test('a failed attempt before the last one throws and leaves the rows processing', async () => {
      const { genImageIds } = await generateLabeledBatch();

      const run = processVisibleWatermarkJob(watermarkJob(0), failingTransforms);

      await expect(run).rejects.toThrow('sharp exploded');
      const rows = await getGenImageRowsByIds({ ids: genImageIds });
      expect(rows.map((row) => row.status)).toEqual(['processing', 'processing']);
      expect(successNotifications()).toHaveLength(0);
    });

    test('a retry after one failure labels the images', async () => {
      const { genImageIds } = await generateLabeledBatch();
      const firstRun = processVisibleWatermarkJob(watermarkJob(0), failingTransforms);
      await expect(firstRun).rejects.toThrow();

      await processVisibleWatermarkJob(watermarkJob(1));

      const rows = await getGenImageRowsByIds({ ids: genImageIds });
      expect(rows.map((row) => row.status)).toEqual(['completed', 'completed']);
      expect(rows.every((row) => row.visibleWatermark)).toBe(true);
    });

    test('a retry writes each labeled image under the same final key', async () => {
      const { genImageIds } = await generateLabeledBatch(1);
      const data = watermarkJobData();
      const rawKey = data.kind === 'image' ? (data.outputs[0]?.storageKey ?? '') : '';

      await processVisibleWatermarkJob(watermarkJob(0));

      const [row] = await getGenImageRowsByIds({ ids: genImageIds });
      expect(row?.media?.storageKey).toBe(rawKey.replace('/unlabeled/', '/'));
    });

    test('a failed hand-off to the watermark queue stores the raw images and notifies', async () => {
      useRealPngImages();
      const { rows } = await seedGenImageBatch({ count: 2, visibleWatermark: true });
      const genImageIds = rows.map((row) => row.id);
      queueAddMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

      await processGenImagesJob(buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds } }));

      const updated = await getGenImageRowsByIds({ ids: genImageIds });
      expect(updated.map((row) => row.status)).toEqual(['completed', 'completed']);
      expect(updated.every((row) => row.visibleWatermark === false)).toBe(true);
      expect(successNotifications()).toHaveLength(1);
    });

    test('an already completed batch is skipped', async () => {
      await generateLabeledBatch();
      const firstJob = watermarkJob();
      await processVisibleWatermarkJob(firstJob);
      queueAddMock.mockClear();

      await processVisibleWatermarkJob(
        buildJob({ ...firstJob, attempts: 3, attemptsMade: 1 }),
        failingTransforms,
      );

      expect(successNotifications()).toHaveLength(0);
    });

    test('generation with the label off completes right away and enqueues no job', async () => {
      const { rows } = await seedGenImageBatch({ count: 1 });
      const genImageIds = rows.map((row) => row.id);

      await processGenImagesJob(buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds } }));

      const updated = await getGenImageRowsByIds({ ids: genImageIds });
      expect(updated[0]?.status).toBe('completed');
      expect(updated[0]?.media).not.toBeNull();
      expect(enqueuedJobs(APPLY_VISIBLE_WATERMARK_JOB)).toHaveLength(0);
    });
  });

  describe('videos', () => {
    async function generateLabeledVideo() {
      const seeded = await seedGenVideo({ visibleWatermark: true });
      await processGenVideoJob(
        buildJob({ name: GEN_VIDEO_JOB, data: { genVideoId: seeded.row.id } }),
      );
      return seeded;
    }

    test('generation with the label on keeps the row processing and hands off', async () => {
      const { row } = await generateLabeledVideo();

      const updated = await getGenVideoById({ id: row.id });
      const data = watermarkJobData();
      expect(updated?.status).toBe('processing');
      expect(updated?.media).toBeNull();
      expect(data.kind === 'video' && data.storageKey.includes('/unlabeled/')).toBe(true);
      expect(successNotifications()).toHaveLength(0);
    });

    test('a successful job stores the labeled video, drops the raw one and notifies once', async () => {
      const { row } = await generateLabeledVideo();
      const data = watermarkJobData();
      const rawKey = data.kind === 'video' ? data.storageKey : '';
      const raw = storage.objects.get(rawKey);

      await processVisibleWatermarkJob(watermarkJob(), fakeTransforms);

      const updated = await getGenVideoById({ id: row.id });
      const stored = storage.objects.get(updated?.media?.storageKey ?? '');
      expect(updated?.status).toBe('completed');
      expect(updated?.visibleWatermark).toBe(true);
      expect(stored?.equals(raw ?? Buffer.alloc(0))).toBe(false);
      expect(storage.objects.has(rawKey)).toBe(false);
      expect(successNotifications()).toHaveLength(1);
    });

    test('the last failed attempt stores the raw video, unlabeled, and notifies', async () => {
      const { row } = await generateLabeledVideo();

      const result = await processVisibleWatermarkJob(watermarkJob(2), failingTransforms);

      const updated = await getGenVideoById({ id: row.id });
      expect(result).toEqual({ success: true });
      expect(updated?.status).toBe('completed');
      expect(updated?.visibleWatermark).toBe(false);
      expect(updated?.media?.storageKey).toContain('/unlabeled/');
      expect(successNotifications()).toHaveLength(1);
    });

    test('a failed attempt before the last one throws and leaves the row processing', async () => {
      const { row } = await generateLabeledVideo();

      const run = processVisibleWatermarkJob(watermarkJob(1), failingTransforms);

      await expect(run).rejects.toThrow('ffmpeg exploded');
      const updated = await getGenVideoById({ id: row.id });
      expect(updated?.status).toBe('processing');
    });

    test('a retry after one failure labels the video', async () => {
      const { row } = await generateLabeledVideo();
      const firstRun = processVisibleWatermarkJob(watermarkJob(0), failingTransforms);
      await expect(firstRun).rejects.toThrow();

      await processVisibleWatermarkJob(watermarkJob(1), fakeTransforms);

      const updated = await getGenVideoById({ id: row.id });
      expect(updated?.visibleWatermark).toBe(true);
    });

    test('a failed hand-off to the watermark queue stores the raw video and notifies', async () => {
      const { row } = await seedGenVideo({ visibleWatermark: true });
      queueAddMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

      await processGenVideoJob(buildJob({ name: GEN_VIDEO_JOB, data: { genVideoId: row.id } }));

      const updated = await getGenVideoById({ id: row.id });
      expect(updated?.status).toBe('completed');
      expect(updated?.visibleWatermark).toBe(false);
      expect(successNotifications()).toHaveLength(1);
    });

    test('a draft with the label on completes with its draft cache key', async () => {
      const { row, userId } = await seedGenVideo({
        visibleWatermark: true,
        isDraft: true,
        status: 'processing',
      });
      const rawKey = `${userId}/videos/unlabeled/raw.mp4`;
      storage.objects.set(rawKey, Buffer.from('raw video'));
      const job = buildJob({
        name: APPLY_VISIBLE_WATERMARK_JOB,
        data: {
          kind: 'video',
          genVideoId: row.id,
          storageKey: rawKey,
          mimeType: 'video/mp4',
          size: 9,
          draftCacheKey: `${userId}/videos/drafts/bundle.bin`,
        },
        attempts: 3,
      });

      await processVisibleWatermarkJob(job, fakeTransforms);

      const updated = await getGenVideoById({ id: row.id });
      expect(updated?.status).toBe('completed');
      expect(updated?.draftCacheKey).toBe(`${userId}/videos/drafts/bundle.bin`);
      expect(updated?.visibleWatermark).toBe(true);
    });

    test('generation with the label off completes right away and enqueues no job', async () => {
      const { row } = await seedGenVideo();

      await processGenVideoJob(buildJob({ name: GEN_VIDEO_JOB, data: { genVideoId: row.id } }));

      const updated = await getGenVideoById({ id: row.id });
      expect(updated?.status).toBe('completed');
      expect(enqueuedJobs(APPLY_VISIBLE_WATERMARK_JOB)).toHaveLength(0);
    });
  });
});
