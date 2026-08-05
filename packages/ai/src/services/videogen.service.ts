import type { GoogleVertexVideoModelOptions } from '@ai-sdk/google-vertex';
import { config } from '@repo/config';
import type {
  GenVideo,
  GenVideoAspectRatio,
  GenVideoResolution,
  GenVideoWithMedia,
  Media,
} from '@repo/database';
import {
  createGenVideoRecord as insertGenVideoRecord,
  createMedia,
  getDefaultAiModelByModality,
  getGenVideoById,
  updateGenVideoStatus,
} from '@repo/database';
import { logger } from '@repo/logger';
import { GEN_VIDEO_JOB, GenVideoJobDto, queue } from '@repo/queue';
import {
  buildVideoUrls,
  downloadObjectBuffer,
  getVideoGenBucketNameForUser,
  uploadObjectBuffer,
} from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { experimental_generateVideo as generateVideo } from 'ai';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import { getVideoModel } from '../factories';

// Veo on Vertex is the only video provider wired up (docs/videogen/prd.md
// non-goals: OpenAI/BFL expose no video models in the installed AI SDK).
export const videoGenProviders = ['google-vertex'] as const;
export const videoGenAspectRatios = ['16:9', '9:16'] as const;
export const videoGenResolutions = ['720p', '1080p'] as const;
export const videoGenDurations = [4, 6, 8] as const;

// workspaceId is not part of the request body schema: the HTTP endpoint
// takes it from the route (`/workspace/:workspaceId/gen-video`), and the
// chat agent's video tool takes it from the chat. Both pass it separately
// into requestGenVideo/createGenVideoRecord below.
export const generateVideoSchema = z.object({
  prompt: z.string().min(1).max(5000),
  provider: z.enum(videoGenProviders).optional(),
  model: z.string().min(1).max(255).optional(),
  aspectRatio: z.enum(videoGenAspectRatios).optional(),
  resolution: z.enum(videoGenResolutions).optional(),
  duration: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
  generateAudio: z.boolean().optional(),
  seed: z.number().int().optional(),
  negativePrompt: z.string().max(5000).optional(),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;

// Same ownership split as social_post_media (social-post.schema.ts): a
// 'genImage' frame references a gen_images object's existing media row (no
// copy), an 'upload' frame's media row was already created for its own
// object under <userId>/videos/frames/.
type FrameInput = { frameOrigin: 'upload' | 'genImage'; frameMediaId: string };

type CreateGenVideoParams = GenerateVideoInput &
  Partial<FrameInput> & { userId: string; workspaceId: string };

export type GenVideoDto = {
  id: string;
  status: GenVideo['status'];
  prompt: string;
  error: string | null;
  videoUrl?: string;
  createdAt: Date;
};

// media is only ever set for a completed row; both call sites below hand in
// a just-created pending row or a just-failed row, neither of which has one
// yet, so the default keeps videoUrl undefined for them.
function toGenVideoDto(record: GenVideo, media: Media | null = null): GenVideoDto {
  return {
    id: record.id,
    status: record.status,
    prompt: record.prompt,
    error: record.error,
    videoUrl: media
      ? buildVideoUrls({ userId: record.userId, key: media.storageKey }).videoUrl
      : undefined,
    createdAt: record.createdAt,
  };
}

/**
 * Resolves the provider/model for a video generation request: the caller's
 * explicit choice, or the default-by-modality model when none is given (the
 * chat tool and a bare form submission never pick a model themselves).
 */
async function resolveVideoModel({
  provider,
  model,
}: {
  provider?: string;
  model?: string;
}): Promise<{ provider: string; model: string }> {
  if (provider && model) {
    return { provider, model };
  }

  const { error, data: defaultModel } = await tryCatch(() =>
    getDefaultAiModelByModality({ modality: 'video' }),
  );

  if (error !== null || !defaultModel) {
    logger.error('No video generation model available', { error });
    throw new Error('No video generation model available');
  }

  return { provider: defaultModel.provider, model: defaultModel.model };
}

/**
 * Inserts a pending gen_videos row. Exported standalone (not just used by
 * requestGenVideo below) for the awaited workflow path: workflow executors
 * call this, then `runGenVideo` inline, with no queue hop
 * (docs/videogen/prd.md decision 2).
 */
export async function createGenVideoRecord(params: CreateGenVideoParams): Promise<GenVideo> {
  const {
    userId,
    workspaceId,
    prompt,
    negativePrompt,
    aspectRatio,
    resolution,
    duration,
    generateAudio,
    seed,
    frameOrigin,
    frameMediaId,
  } = params;

  const { provider, model } = await resolveVideoModel(params);

  return insertGenVideoRecord({
    userId,
    workspaceId,
    status: 'pending',
    prompt,
    negativePrompt,
    provider,
    model,
    aspectRatio: aspectRatio ?? '16:9',
    resolution: resolution ?? '720p',
    duration: duration ?? 4,
    generateAudio: generateAudio ?? true,
    seed,
    frameOrigin,
    frameMediaId,
  });
}

/**
 * Request side (API + chat tool, docs/videogen/prd.md decision 2): inserts
 * the pending row and enqueues the gen-video job, then returns immediately.
 * The worker (gen-video.processor.ts) does the slow part.
 */
export async function requestGenVideo(params: CreateGenVideoParams): Promise<GenVideoDto> {
  const record = await createGenVideoRecord(params);

  const { error } = await tryCatch(() =>
    queue.genVideo().add(GEN_VIDEO_JOB, new GenVideoJobDto({ genVideoId: record.id }).toJSON()),
  );

  if (error === null) {
    return toGenVideoDto(record);
  }

  // Queueing failed (e.g. Redis is down): mark the row failed instead of
  // leaving it stuck pending with no job behind it, mirrors
  // agent-context-document.service.ts's enqueue failure handling.
  logger.error('Failed to enqueue gen-video job', { error, genVideoId: record.id });

  const failed = await updateGenVideoStatus({
    id: record.id,
    status: 'failed',
    error: 'Failed to enqueue video generation',
  });

  return toGenVideoDto(failed);
}

// Veo accepts 16:9 and 9:16, but 1080p is only documented for 16:9 (9:16
// stays at 720p). The @ai-sdk/google-vertex adapter passes
// aspectRatio/resolution/duration straight through to Vertex with no
// client-side validation of its own, so this map is what enforces the
// combination on our side, the way imagen.service.ts's ratiosResolutionMap
// does for Imagen. Conservative because the installed SDK types carry no
// per-model doc comments to verify against.
const supportedResolutionsByAspectRatio: Record<
  GenVideoAspectRatio,
  readonly GenVideoResolution[]
> = {
  '16:9': ['720p', '1080p'],
  '9:16': ['720p'],
};

// The `ai` package's experimental_generateVideo() takes resolution as
// `{width}x{height}`; the vertex adapter maps that back to '720p' / '1080p'
// / '4k' internally (google-vertex-video-model.ts).
const resolutionDimensions: Record<GenVideoResolution, `${number}x${number}`> = {
  '720p': '1280x720',
  '1080p': '1920x1080',
};

function resolveVertexResolution(
  aspectRatio: GenVideoAspectRatio,
  resolution: GenVideoResolution,
): `${number}x${number}` {
  const supported = supportedResolutionsByAspectRatio[aspectRatio];

  if (!supported.includes(resolution)) {
    logger.warn(
      `Resolution ${resolution} is not supported for aspect ratio ${aspectRatio}, using 720p`,
    );
    return resolutionDimensions['720p'];
  }

  return resolutionDimensions[resolution];
}

type GenerateVideoParams = Parameters<typeof generateVideo>[0];
type GenerateVideoProviderOptions = GenerateVideoParams['providerOptions'];

// SDK expects Record<string, JSONObject> but the typed provider options lack
// an index signature; a single cast from unknown bridges the gap without
// losing satisfies validation at the call site below (mirrors
// imagen.service.ts's toProviderOptions).
const toProviderOptions = (opts: unknown): GenerateVideoProviderOptions =>
  opts as GenerateVideoProviderOptions;

/**
 * Runs the actual generation for one row: downloads the first-frame image
 * when set, calls Veo, and uploads the resulting mp4. Returns the storage
 * key and byte size on success (the caller turns that into a media row);
 * throws on any failure, `runGenVideo` below is what records the failure on
 * the row.
 */
async function generateAndUploadVideo(
  record: GenVideoWithMedia,
): Promise<{ storageKey: string; size: number }> {
  let frameImages: { image: Buffer; frameType: 'first_frame' }[] | undefined;

  if (record.frameMedia?.storageKey) {
    const { buffer } = await downloadObjectBuffer(
      config.cfImagesBucketName,
      record.frameMedia.storageKey,
    );
    frameImages = [{ image: buffer, frameType: 'first_frame' }];
  }

  const aspectRatio = record.aspectRatio ?? '16:9';
  const resolution = record.resolution ?? '720p';

  const result = await generateVideo({
    model: getVideoModel({ provider: record.provider, model: record.model }),
    prompt: record.prompt,
    aspectRatio,
    resolution: resolveVertexResolution(aspectRatio, resolution),
    duration: record.duration ?? undefined,
    generateAudio: record.generateAudio,
    seed: record.seed ?? undefined,
    frameImages,
    // A retried Veo call re-renders the whole clip, several minutes and a
    // full generation cost for what BullMQ already treats as a hard
    // failure (no job retries, docs/videogen/prd.md worker section), so the
    // SDK's own retry loop is turned off here too.
    maxRetries: 0,
    providerOptions: record.negativePrompt
      ? toProviderOptions({
          vertex: {
            negativePrompt: record.negativePrompt,
          } satisfies GoogleVertexVideoModelOptions,
        })
      : undefined,
  });

  const [video] = result.videos;

  if (!video) {
    throw new Error('Video generation returned no videos');
  }

  const { bucketName, prefix } = getVideoGenBucketNameForUser(record.userId);
  const key = `${prefix}/${randomUUID()}.mp4`;

  await uploadObjectBuffer({
    bucketName,
    key,
    buffer: video.uint8Array,
    contentType: video.mediaType || 'video/mp4',
  });

  return { storageKey: key, size: video.uint8Array.byteLength };
}

// runGenVideo's success path needs to hand the caller the freshly created
// media row (for the video URL) alongside the updated GenVideo row;
// updateGenVideoStatus itself only ever returns the plain row (no join), so
// this is the one case where the two travel together (docs/media-library/
// migration-prd.md decision 6).
export type RunGenVideoResult = GenVideo & { media: Media | null };

/**
 * Run side (docs/videogen/prd.md): loads the row, flips it to processing,
 * generates and uploads the video, creates its media row, then flips the
 * row to completed pointing at that media. Any failure flips it to failed
 * with the error and rethrows. Called from the gen-video processor (async
 * path) and the awaiting tool variant in workflows (inline path).
 * Notification enqueueing happens only in the processor, never here.
 */
export async function runGenVideo({
  genVideoId,
}: {
  genVideoId: string;
}): Promise<RunGenVideoResult> {
  const record = await getGenVideoById({ id: genVideoId });

  if (!record) {
    throw new Error(`Gen video ${genVideoId} not found`);
  }

  await updateGenVideoStatus({ id: genVideoId, status: 'processing' });

  const { error, data: result } = await tryCatch(() => generateAndUploadVideo(record));

  if (error !== null || !result) {
    logger.error('Video generation failed', { error, genVideoId });
    await updateGenVideoStatus({
      id: genVideoId,
      status: 'failed',
      error: error?.message ?? 'Video generation failed',
    });
    throw error ?? new Error('Video generation failed');
  }

  const createdMedia = await createMedia({
    ownerWorkspaceId: record.workspaceId,
    bucket: config.cfImagesBucketName,
    storageKey: result.storageKey,
    filename: result.storageKey.split('/').pop() ?? result.storageKey,
    mimeType: 'video/mp4',
    size: result.size,
    origin: 'generated',
  });

  const updated = await updateGenVideoStatus({
    id: genVideoId,
    status: 'completed',
    mediaId: createdMedia.id,
  });

  return { ...updated, media: createdMedia };
}
