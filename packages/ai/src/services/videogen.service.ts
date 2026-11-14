import type { BlackForestLabsVideoModelOptions } from '@ai-sdk/black-forest-labs';
import type { GoogleVertexVideoModelOptions } from '@ai-sdk/google-vertex';
import { isJSONArray, isJSONObject } from '@ai-sdk/provider';
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
  getEnhanceForGenVideo,
  getGenVideoById,
  updateGenVideoStatus,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  APPLY_VISIBLE_WATERMARK_JOB,
  GEN_VIDEO_JOB,
  genVideoJobSchema,
  queue,
  visibleWatermarkJobSchema,
} from '@repo/queue';
import {
  toPublicMediaUrl,
  downloadObjectBuffer,
  getVideoDraftBucketNameForUser,
  getVideoGenBucketNameForUser,
  uploadObjectBuffer,
} from '@repo/storage';
import { tryCatch } from '@repo/utils';
import type { GenerateVideoResult } from 'ai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import { getVideoModel } from '../factories';
import { toUnlabeledPrefix } from './unlabeled-storage-key.service';

// Veo on Vertex and BFL flux-3-video.
export const videoGenProviders = ['google-vertex', 'bfl'] as const;
export type VideoGenProvider = (typeof videoGenProviders)[number];

// Union of Veo's ratios and BFL's ratios. Which ones a given provider
// actually accepts lives in videoGenCapabilities below, not in this list.
export const videoGenAspectRatios = [
  '21:9',
  '2:1',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  'auto',
] as const;
export const videoGenResolutions = ['720p', '1080p'] as const;

export interface VideoGenCapability {
  aspectRatios: readonly GenVideoAspectRatio[];
  resolutionsByAspectRatio: Partial<Record<GenVideoAspectRatio, readonly GenVideoResolution[]>>;
  durationRange: { min: number; max: number };
  supportsSeed: boolean;
  supportsNegativePrompt: boolean;
  supportsDraft: boolean;
}

// Per-provider constraints driving both the service-level enforcement below
// and the form. Veo and BFL disagree on
// nearly every axis, so this replaces v1's flat videoGenDurations constant
// instead of trying to widen it to fit both.
export const videoGenCapabilities: Record<VideoGenProvider, VideoGenCapability> = {
  'google-vertex': {
    aspectRatios: ['16:9', '9:16'],
    // 1080p is only documented for 16:9; 9:16 stays at 720p.
    resolutionsByAspectRatio: {
      '16:9': ['720p', '1080p'],
      '9:16': ['720p'],
    },
    durationRange: { min: 4, max: 8 },
    supportsSeed: true,
    supportsNegativePrompt: true,
    supportsDraft: false,
  },
  bfl: {
    aspectRatios: ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto'],
    // Both resolution tiers are available at every ratio (verified SDK
    // facts).
    resolutionsByAspectRatio: {
      '21:9': ['720p', '1080p'],
      '2:1': ['720p', '1080p'],
      '16:9': ['720p', '1080p'],
      '4:3': ['720p', '1080p'],
      '1:1': ['720p', '1080p'],
      '3:4': ['720p', '1080p'],
      '9:16': ['720p', '1080p'],
      auto: ['720p', '1080p'],
    },
    durationRange: { min: 5, max: 20 },
    supportsSeed: false,
    supportsNegativePrompt: false,
    supportsDraft: true,
  },
};

function resolveCapability(provider: string): VideoGenCapability {
  if (provider === 'google-vertex' || provider === 'bfl') {
    return videoGenCapabilities[provider];
  }

  throw new Error(`Unsupported video provider: ${provider}`);
}

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
  duration: z.number().int().min(4).max(20).optional(),
  generateAudio: z.boolean().optional(),
  seed: z.number().int().optional(),
  negativePrompt: z.string().max(5000).optional(),
  draft: z.boolean().optional(),
  // EU AI Act Art. 50(4) visible-disclosure toggle.
  // Default off; applied by the visible-watermark job after the raw render is stored.
  // Enhance rows copy it from the parent draft (requestEnhanceGenVideo).
  visibleWatermark: z.boolean().optional(),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;

// Rejects a request against the resolved provider's capability map (decision
// 5): the user picked these values explicitly in the form, so an
// unsupported combination is an error at request time, never a silent
// coercion.
function assertCapabilities(
  capability: VideoGenCapability,
  provider: string,
  input: Pick<GenerateVideoInput, 'aspectRatio' | 'duration' | 'seed' | 'negativePrompt' | 'draft'>,
): void {
  if (input.aspectRatio && !capability.aspectRatios.includes(input.aspectRatio)) {
    throw new Error(`Provider ${provider} does not support aspect ratio ${input.aspectRatio}`);
  }

  if (
    input.duration !== undefined &&
    (input.duration < capability.durationRange.min || input.duration > capability.durationRange.max)
  ) {
    throw new Error(
      `Provider ${provider} supports durations from ${capability.durationRange.min} to ${capability.durationRange.max} seconds`,
    );
  }

  if (input.seed !== undefined && !capability.supportsSeed) {
    throw new Error(`Provider ${provider} does not support a seed`);
  }

  if (input.negativePrompt !== undefined && !capability.supportsNegativePrompt) {
    throw new Error(`Provider ${provider} does not support a negative prompt`);
  }

  if (input.draft && !capability.supportsDraft) {
    throw new Error(`Provider ${provider} does not support draft mode`);
  }
}

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
  isDraft: boolean;
  parentGenVideoId: string | null;
  visibleWatermark: boolean;
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
    isDraft: record.isDraft,
    parentGenVideoId: record.parentGenVideoId,
    visibleWatermark: record.visibleWatermark,
    videoUrl: media ? toPublicMediaUrl(media.storageKey) : undefined,
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
 * call this, then `runGenVideo` inline, with no queue hop.
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
    draft,
    visibleWatermark,
    frameOrigin,
    frameMediaId,
  } = params;

  const { provider, model } = await resolveVideoModel(params);
  const capability = resolveCapability(provider);

  assertCapabilities(capability, provider, { aspectRatio, duration, seed, negativePrompt, draft });

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
    duration: duration ?? capability.durationRange.min,
    generateAudio: generateAudio ?? true,
    seed,
    isDraft: draft ?? false,
    visibleWatermark: visibleWatermark ?? false,
    frameOrigin,
    frameMediaId,
  });
}

/**
 * Enqueues the gen-video job for an already-inserted row, or marks it failed
 * if queueing itself fails (e.g. Redis is down), mirroring
 * agent-context-document.service.ts's enqueue failure handling. Shared by
 * requestGenVideo and requestEnhanceGenVideo below: both create a row up
 * front and hand off to the same queue and processor.
 */
async function enqueueGenVideoJob(record: GenVideo): Promise<GenVideoDto> {
  const { error } = await tryCatch(() =>
    queue.genVideo().add(GEN_VIDEO_JOB, genVideoJobSchema.parse({ genVideoId: record.id })),
  );

  if (error === null) {
    return toGenVideoDto(record);
  }

  logger.error('Failed to enqueue gen-video job', { error, genVideoId: record.id });

  const failed = await updateGenVideoStatus({
    id: record.id,
    status: 'failed',
    error: 'Failed to enqueue video generation',
  });

  return toGenVideoDto(failed);
}

/**
 * Request side (API + chat tool): inserts
 * the pending row and enqueues the gen-video job, then returns immediately.
 * The worker (gen-video.processor.ts) does the slow part.
 */
export async function requestGenVideo(params: CreateGenVideoParams): Promise<GenVideoDto> {
  const record = await createGenVideoRecord(params);

  return enqueueGenVideoJob(record);
}

/**
 * Enhance side: turns a
 * completed BFL draft into a new pending row that re-renders it at full
 * quality. Validates the parent is a completed BFL draft with a persisted
 * bundle in the caller's workspace, applies the one-enhance-per-draft check,
 * then copies the parent's prompt/settings/provider/model onto a new row
 * (BFL ignores them in draft_enhance mode; the copy exists so the grid,
 * preview dialog, and notifications render without a parent lookup) and
 * enqueues the same job. Enqueue-failure handling mirrors requestGenVideo.
 */
export async function requestEnhanceGenVideo({
  genVideoId,
  userId,
  workspaceId,
}: {
  genVideoId: string;
  userId: string;
  workspaceId: string;
}): Promise<GenVideoDto> {
  const parent = await getGenVideoById({ id: genVideoId });

  if (!parent || parent.workspaceId !== workspaceId) {
    throw new Error(`Gen video ${genVideoId} not found in workspace ${workspaceId}`);
  }

  if (parent.provider !== 'bfl' || !parent.isDraft) {
    throw new Error(`Gen video ${genVideoId} is not a BFL draft`);
  }

  if (parent.status !== 'completed' || !parent.draftCacheKey) {
    throw new Error(`Gen video ${genVideoId} is not a completed draft`);
  }

  const existingEnhance = await getEnhanceForGenVideo({ parentGenVideoId: genVideoId });

  if (existingEnhance) {
    throw new Error(`Gen video ${genVideoId} already has a pending or completed enhance`);
  }

  const record = await insertGenVideoRecord({
    userId,
    workspaceId,
    status: 'pending',
    prompt: parent.prompt,
    negativePrompt: parent.negativePrompt,
    provider: parent.provider,
    model: parent.model,
    aspectRatio: parent.aspectRatio,
    resolution: parent.resolution,
    duration: parent.duration,
    generateAudio: parent.generateAudio,
    seed: parent.seed,
    // Critical:
    // the badge is burned into what we store, never sent
    // to BFL, so a draft's badge can't survive into the replayed enhance
    // bundle. Copying the flag here makes the enhanced render get its own badge.
    visibleWatermark: parent.visibleWatermark,
    frameOrigin: parent.frameOrigin,
    frameMediaId: parent.frameMediaId,
    isDraft: false,
    parentGenVideoId: parent.id,
  });

  return enqueueGenVideoJob(record);
}

// Veo accepts 16:9 and 9:16, but 1080p is only documented for 16:9 (9:16
// stays at 720p). The @ai-sdk/google-vertex adapter passes
// aspectRatio/resolution/duration straight through to Vertex with no
// client-side validation of its own, so this map is what enforces the
// combination on our side, the way imagen.service.ts's ratiosResolutionMap
// does for Imagen. Conservative because the installed SDK types carry no
// per-model doc comments to verify against.
const supportedResolutionsByAspectRatio: Partial<
  Record<GenVideoAspectRatio, readonly GenVideoResolution[]>
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

const VERTEX_ASPECT_RATIOS = ['16:9', '9:16'] as const;
type VertexAspectRatio = (typeof VERTEX_ASPECT_RATIOS)[number];

// The vertex adapter's top-level aspectRatio param is typed narrower than
// the widened GenVideoAspectRatio column (BFL's extra ratios don't apply
// here). assertCapabilities already rejected any non-vertex ratio at request
// time, so this is a type narrowing for the SDK call, not a runtime
// fallback; '16:9' only wins if the stored value is somehow neither vertex
// ratio.
function resolveVertexAspectRatio(aspectRatio: GenVideoAspectRatio): VertexAspectRatio {
  for (const ratio of VERTEX_ASPECT_RATIOS) {
    if (ratio === aspectRatio) {
      return ratio;
    }
  }

  return '16:9';
}

function resolveVertexResolution(
  aspectRatio: VertexAspectRatio,
  resolution: GenVideoResolution,
): `${number}x${number}` {
  const supported = supportedResolutionsByAspectRatio[aspectRatio] ?? [];

  if (!supported.includes(resolution)) {
    logger.warn(
      `Resolution ${resolution} is not supported for aspect ratio ${aspectRatio}, using 720p`,
    );
    return resolutionDimensions['720p'];
  }

  return resolutionDimensions[resolution];
}

// Storage keeps '720p'/'1080p'; the
// BFL call path maps that vocabulary onto its own 'hd'/'fhd' tiers, the same
// way resolveVertexResolution maps it onto Vertex's `{width}x{height}`.
const bflResolutionTiers: Record<GenVideoResolution, 'hd' | 'fhd'> = {
  '720p': 'hd',
  '1080p': 'fhd',
};

type GenerateVideoParams = Parameters<typeof generateVideo>[0];
type GenerateVideoProviderOptions = GenerateVideoParams['providerOptions'];

// SDK expects Record<string, JSONObject> but the typed provider options lack
// an index signature; a single cast from unknown bridges the gap without
// losing satisfies validation at the call site below (mirrors
// imagen.service.ts's toProviderOptions).
const toProviderOptions = (opts: unknown): GenerateVideoProviderOptions =>
  opts as GenerateVideoProviderOptions;

interface UploadGeneratedVideoResult {
  bucket: string;
  storageKey: string;
  size: number;
}

// Storage keys are prefixed by the author, who may have been deleted mid-generation.
function requireAuthorId(record: Pick<GenVideoWithMedia, 'id' | 'userId'>): string {
  if (!record.userId) {
    throw new Error(`Gen video ${record.id} has no author left to store its output under`);
  }

  return record.userId;
}

// Every generation route funnels its output through here. A labeled render is
// stored under an internal key, the visible-watermark job moves it to its final key.
async function uploadGeneratedVideo(
  record: Pick<GenVideoWithMedia, 'id' | 'userId' | 'visibleWatermark'>,
  video: { uint8Array: Uint8Array; mediaType?: string },
): Promise<UploadGeneratedVideoResult> {
  const userId = requireAuthorId(record);
  const buffer = Buffer.from(video.uint8Array);
  const { bucketName, prefix } = getVideoGenBucketNameForUser(userId);
  const keyPrefix = record.visibleWatermark ? toUnlabeledPrefix(prefix) : prefix;
  const key = `${keyPrefix}/${randomUUID()}.mp4`;

  await uploadObjectBuffer({
    bucketName,
    key,
    buffer,
    contentType: video.mediaType || 'video/mp4',
  });

  return { bucket: bucketName, storageKey: key, size: buffer.byteLength };
}

// Narrows the loosely-typed providerMetadata (Record<string, JSONObject>)
// down to the draftCache URL without an `any` cast, using @ai-sdk/provider's
// own JSON type guards.
function extractDraftCacheUrl(
  providerMetadata: GenerateVideoResult['providerMetadata'],
): string | undefined {
  const bfl = providerMetadata.blackForestLabs;

  if (!bfl || !isJSONArray(bfl.videos)) {
    return undefined;
  }

  const [first] = bfl.videos;

  if (!isJSONObject(first)) {
    return undefined;
  }

  return typeof first.draftCache === 'string' ? first.draftCache : undefined;
}

/**
 * Persists a completed draft's `.bin` bundle to R2:
 * the `draftCache` URL BFL returns is time-limited, so it is
 * downloaded right away rather than depending on it staying valid until the
 * user clicks Enhance.
 */
async function persistDraftCache(
  userId: string,
  providerMetadata: GenerateVideoResult['providerMetadata'],
): Promise<string> {
  const draftCacheUrl = extractDraftCacheUrl(providerMetadata);

  if (!draftCacheUrl) {
    throw new Error('BFL draft completed with no draftCache URL');
  }

  const response = await fetch(draftCacheUrl);

  if (!response.ok) {
    throw new Error(`Failed to download draft cache bundle: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const { bucketName, prefix } = getVideoDraftBucketNameForUser(userId);
  const key = `${prefix}/${randomUUID()}.bin`;

  await uploadObjectBuffer({
    bucketName,
    key,
    buffer,
    contentType: 'application/octet-stream',
  });

  return key;
}

// The result of the run side's provider call: the uploaded mp4's location and
// size, and the draft bundle's key when the row is a draft (null otherwise).
export interface GenerateAndUploadVideoResult {
  bucket: string;
  storageKey: string;
  size: number;
  draftCacheKey: string | null;
}

async function downloadFrameImage(
  record: GenVideoWithMedia,
): Promise<{ image: Buffer; frameType: 'first_frame' }[] | undefined> {
  if (!record.frameMedia?.storageKey) {
    return undefined;
  }

  const { buffer } = await downloadObjectBuffer(
    record.frameMedia.bucket,
    record.frameMedia.storageKey,
  );

  return [{ image: buffer, frameType: 'first_frame' }];
}

/**
 * BFL standard and draft renders: resolution and
 * aspect ratio go through providerOptions.blackForestLabs, draft: true only
 * when the row is a draft. No seed, no negative prompt: assertCapabilities
 * already rejected them for this provider at request time.
 */
async function generateBflVideo(record: GenVideoWithMedia): Promise<GenerateAndUploadVideoResult> {
  const frameImages = await downloadFrameImage(record);
  const aspectRatio = record.aspectRatio ?? '16:9';
  const resolution = record.resolution ?? '720p';

  const result = await generateVideo({
    model: getVideoModel({ provider: record.provider, model: record.model }),
    prompt: record.prompt,
    duration: record.duration ?? undefined,
    generateAudio: record.generateAudio,
    frameImages,
    maxRetries: 0,
    providerOptions: toProviderOptions({
      blackForestLabs: {
        resolution: bflResolutionTiers[resolution],
        aspectRatio,
        draft: record.isDraft || undefined,
      } satisfies BlackForestLabsVideoModelOptions,
    }),
  });

  const [video] = result.videos;

  if (!video) {
    throw new Error('Video generation returned no videos');
  }

  const { bucket, storageKey, size } = await uploadGeneratedVideo(record, video);

  if (!record.isDraft) {
    return { bucket, storageKey, size, draftCacheKey: null };
  }

  const draftCacheKey = await persistDraftCache(requireAuthorId(record), result.providerMetadata);

  return { bucket, storageKey, size, draftCacheKey };
}

/**
 * BFL enhance: replays the parent
 * draft's bundle at full quality. Prompt, duration, resolution, audio, and
 * keyframes are all ignored by BFL in draft_enhance mode, so the call only
 * carries the model and the base64 bundle; `prompt` is still passed because
 * the SDK's top-level call shape requires it.
 */
async function generateEnhanceVideo(
  record: GenVideoWithMedia,
): Promise<GenerateAndUploadVideoResult> {
  if (!record.parentGenVideoId) {
    throw new Error(`Gen video ${record.id} has no parentGenVideoId to enhance`);
  }

  const parent = await getGenVideoById({ id: record.parentGenVideoId });

  if (!parent?.draftCacheKey) {
    throw new Error(`Parent draft ${record.parentGenVideoId} has no persisted draft cache`);
  }

  const { buffer } = await downloadObjectBuffer(config.s3ImagesBucketName, parent.draftCacheKey);

  const result = await generateVideo({
    model: getVideoModel({ provider: record.provider, model: record.model }),
    prompt: record.prompt,
    maxRetries: 0,
    providerOptions: toProviderOptions({
      blackForestLabs: {
        draftCache: buffer.toString('base64'),
      } satisfies BlackForestLabsVideoModelOptions,
    }),
  });

  const [video] = result.videos;

  if (!video) {
    throw new Error('Video generation returned no videos');
  }

  const { bucket, storageKey, size } = await uploadGeneratedVideo(record, video);

  return { bucket, storageKey, size, draftCacheKey: null };
}

/**
 * Veo on Vertex.
 */
async function generateVertexVideo(
  record: GenVideoWithMedia,
): Promise<GenerateAndUploadVideoResult> {
  const frameImages = await downloadFrameImage(record);
  const aspectRatio = resolveVertexAspectRatio(record.aspectRatio ?? '16:9');
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
    // failure (no job retries), so the
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

  const { bucket, storageKey, size } = await uploadGeneratedVideo(record, video);

  return { bucket, storageKey, size, draftCacheKey: null };
}

/**
 * Runs the actual generation for one row and uploads the mp4, branching on
 * the row: an enhance row
 * (parentGenVideoId set) always replays its parent's bundle, a BFL row goes
 * through the draft/standard path, everything else is Veo. Returns the
 * storage key, byte size, and draft cache key (null unless this row is a
 * draft) on success; `runGenVideo` below is what records the failure on the
 * row and the draft cache key on success.
 */
async function generateAndUploadVideo(
  record: GenVideoWithMedia,
): Promise<GenerateAndUploadVideoResult> {
  requireAuthorId(record);

  if (record.parentGenVideoId) {
    return generateEnhanceVideo(record);
  }

  if (record.provider === 'bfl') {
    return generateBflVideo(record);
  }

  return generateVertexVideo(record);
}

export interface CompleteGenVideoParams {
  record: Pick<GenVideo, 'id' | 'workspaceId'>;
  storageKey: string;
  size: number;
  draftCacheKey: string | null;
  visibleWatermark: boolean;
}

// The completed row travels with its freshly created media row (for the video URL).
export type RunGenVideoResult = GenVideo & { media: Media | null };

/**
 * Creates the media row and flips the row to completed. `visibleWatermark` is
 * the actual outcome, not the request.
 */
export async function completeGenVideo({
  record,
  storageKey,
  size,
  draftCacheKey,
  visibleWatermark,
}: CompleteGenVideoParams): Promise<RunGenVideoResult> {
  const createdMedia = await createMedia({
    ownerWorkspaceId: record.workspaceId,
    bucket: config.s3ImagesBucketName,
    storageKey,
    filename: storageKey.split('/').pop() ?? storageKey,
    mimeType: 'video/mp4',
    size,
    origin: 'generated',
  });

  const updated = await updateGenVideoStatus({
    id: record.id,
    status: 'completed',
    mediaId: createdMedia.id,
    draftCacheKey,
    visibleWatermark,
  });

  return { ...updated, media: createdMedia };
}

export interface GenVideoCompleted {
  outcome: 'completed';
  video: RunGenVideoResult;
}

export interface GenVideoWatermarking {
  outcome: 'watermarking';
}

export type RunGenVideoOutcome = GenVideoCompleted | GenVideoWatermarking;

async function enqueueVisibleWatermarkForVideo(
  genVideoId: string,
  result: GenerateAndUploadVideoResult,
): Promise<void> {
  const data = visibleWatermarkJobSchema.parse({
    kind: 'video',
    genVideoId,
    bucket: result.bucket,
    storageKey: result.storageKey,
    mimeType: 'video/mp4',
    size: result.size,
    draftCacheKey: result.draftCacheKey,
  });

  await queue.visibleWatermark().add(APPLY_VISIBLE_WATERMARK_JOB, data, { attempts: 3 });
}

/**
 * Run side: loads the row, flips it to processing, generates and uploads the
 * video. Without the label the row completes here. With it, the row stays
 * processing and the visible-watermark job completes it. Any failure flips the
 * row to failed and rethrows. Notifications are sent by the processors, never here.
 */
export async function runGenVideo({
  genVideoId,
}: {
  genVideoId: string;
}): Promise<RunGenVideoOutcome> {
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

  if (record.visibleWatermark) {
    const { error: enqueueError } = await tryCatch(() =>
      enqueueVisibleWatermarkForVideo(genVideoId, result),
    );

    if (enqueueError === null) {
      return { outcome: 'watermarking' };
    }

    logger.error('Failed to enqueue visible-watermark job, storing raw video', {
      error: enqueueError,
      genVideoId,
    });
  }

  const video = await completeGenVideo({
    record,
    storageKey: result.storageKey,
    size: result.size,
    draftCacheKey: result.draftCacheKey,
    visibleWatermark: false,
  });

  return { outcome: 'completed', video };
}
