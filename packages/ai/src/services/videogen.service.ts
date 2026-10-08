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
import { applyVideoWatermark } from '@repo/media';
import { GEN_VIDEO_JOB, genVideoJobSchema, queue } from '@repo/queue';
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

// Veo on Vertex and BFL flux-3-video (specs/videogen/prd-v2.md).
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
// and the form (specs/videogen/prd-v2.md decision 5). Veo and BFL disagree on
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
    // facts, specs/videogen/prd-v2.md).
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
  // Art. 50(4) visible-disclosure toggle (specs/ai-labeling/prd.md part 2).
  // Default off; applied after render, before upload, by
  // applyVideoWatermark below (uploadGeneratedVideo). Enhance rows copy it
  // from the parent draft (requestEnhanceGenVideo).
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
    videoUrl: media
      ? toPublicMediaUrl(media.storageKey)
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
 * (specs/videogen/prd.md decision 2).
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
 * Request side (API + chat tool, specs/videogen/prd.md decision 2): inserts
 * the pending row and enqueues the gen-video job, then returns immediately.
 * The worker (gen-video.processor.ts) does the slow part.
 */
export async function requestGenVideo(params: CreateGenVideoParams): Promise<GenVideoDto> {
  const record = await createGenVideoRecord(params);

  return enqueueGenVideoJob(record);
}

/**
 * Enhance side (specs/videogen/prd-v2.md decisions 1, 2, 4): turns a
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
    // Critical (specs/ai-labeling/prd.md "Interaction with videogen v2
    // draft/enhance"): the badge is burned into what we store, never sent
    // to BFL, so a draft's badge can't survive into the replayed enhance
    // bundle. Copying the flag here is what makes uploadGeneratedVideo
    // re-apply it to the enhanced render below.
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

// Storage keeps '720p'/'1080p' (specs/videogen/prd-v2.md decision 6); the
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
  storageKey: string;
  size: number;
  // The actual outcome of this upload, not the request: true only when the
  // watermark attempt below both ran and succeeded. runGenVideo persists
  // this onto gen_videos.visibleWatermark (specs/ai-labeling/prd.md "Failure
  // semantics").
  visibleWatermark: boolean;
}

// Every generation route (standard, draft, enhance, Veo and BFL alike)
// funnels its output through here before it reaches storage, so this is the
// one place that needs to know about visibleWatermark rather than each of
// the three generate* functions below (specs/ai-labeling/prd.md part 2:
// provider-independent, applies on every route).
//
// Best-effort (specs/ai-labeling/prd.md "Failure semantics"): a render is
// paid for and must never be lost to a labeling bug, so a failed watermark
// attempt logs a warning and falls back to the raw bytes instead of failing
// the generation. The returned visibleWatermark flag is what runGenVideo
// writes back to the row, so a failure here also flips the row from
// "requested" to "not applied".
async function uploadGeneratedVideo(
  record: Pick<GenVideoWithMedia, 'userId' | 'visibleWatermark'>,
  video: { uint8Array: Uint8Array; mediaType?: string },
): Promise<UploadGeneratedVideoResult> {
  const rawBuffer = Buffer.from(video.uint8Array);
  // Buffer's generic must be widened explicitly: rawBuffer is
  // Buffer<ArrayBuffer>, but applyVideoWatermark's result comes back through
  // fs/promises readFile as the broader Buffer<ArrayBufferLike>.
  let buffer: Buffer = rawBuffer;
  let visibleWatermark = false;

  if (record.visibleWatermark) {
    const { error, data } = await tryCatch(() => applyVideoWatermark({ buffer: rawBuffer }));

    if (error !== null || !data) {
      logger.warn('Visible watermark failed, storing raw video instead', {
        error,
        userId: record.userId,
      });
    } else {
      buffer = data.buffer;
      visibleWatermark = true;
    }
  }

  const { bucketName, prefix } = getVideoGenBucketNameForUser(record.userId);
  const key = `${prefix}/${randomUUID()}.mp4`;

  await uploadObjectBuffer({
    bucketName,
    key,
    buffer,
    contentType: video.mediaType || 'video/mp4',
  });

  return { storageKey: key, size: buffer.byteLength, visibleWatermark };
}

// Narrows the loosely-typed providerMetadata (Record<string, JSONObject>)
// down to the draftCache URL without an `any` cast, using @ai-sdk/provider's
// own JSON type guards.
function extractDraftCacheUrl(providerMetadata: GenerateVideoResult['providerMetadata']): string | undefined {
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
 * Persists a completed draft's `.bin` bundle to R2 (specs/videogen/prd-v2.md
 * decision 3): the `draftCache` URL BFL returns is time-limited, so it is
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

// The result of the run side's provider call: the uploaded mp4's key and
// size, the draft bundle's key when the row is a draft (null otherwise), and
// the watermark's actual outcome. runGenVideo stores all four on the row.
export interface GenerateAndUploadVideoResult {
  storageKey: string;
  size: number;
  draftCacheKey: string | null;
  visibleWatermark: boolean;
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
 * BFL standard and draft renders (specs/videogen/prd-v2.md): resolution and
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

  const { storageKey, size, visibleWatermark } = await uploadGeneratedVideo(record, video);

  if (!record.isDraft) {
    return { storageKey, size, draftCacheKey: null, visibleWatermark };
  }

  const draftCacheKey = await persistDraftCache(record.userId, result.providerMetadata);

  return { storageKey, size, draftCacheKey, visibleWatermark };
}

/**
 * BFL enhance (specs/videogen/prd-v2.md decision 1): replays the parent
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

  const { storageKey, size, visibleWatermark } = await uploadGeneratedVideo(record, video);

  return { storageKey, size, draftCacheKey: null, visibleWatermark };
}

/**
 * Veo on Vertex (specs/videogen/prd.md, unchanged by v2 besides the
 * aspect-ratio type narrowing above).
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
    // failure (no job retries, specs/videogen/prd.md worker section), so the
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

  const { storageKey, size, visibleWatermark } = await uploadGeneratedVideo(record, video);

  return { storageKey, size, draftCacheKey: null, visibleWatermark };
}

/**
 * Runs the actual generation for one row and uploads the mp4, branching on
 * the row (specs/videogen/prd-v2.md decision 7): an enhance row
 * (parentGenVideoId set) always replays its parent's bundle, a BFL row goes
 * through the draft/standard path, everything else is Veo. Returns the
 * storage key, byte size, and draft cache key (null unless this row is a
 * draft) on success; `runGenVideo` below is what records the failure on the
 * row and the draft cache key on success.
 */
async function generateAndUploadVideo(
  record: GenVideoWithMedia,
): Promise<GenerateAndUploadVideoResult> {
  if (record.parentGenVideoId) {
    return generateEnhanceVideo(record);
  }

  if (record.provider === 'bfl') {
    return generateBflVideo(record);
  }

  return generateVertexVideo(record);
}

// runGenVideo's success path needs to hand the caller the freshly created
// media row (for the video URL) alongside the updated GenVideo row;
// updateGenVideoStatus itself only ever returns the plain row (no join), so
// this is the one case where the two travel together (specs/media-library/
// migration-prd.md decision 6).
export type RunGenVideoResult = GenVideo & { media: Media | null };

/**
 * Run side (specs/videogen/prd.md): loads the row, flips it to processing,
 * generates and uploads the video, creates its media row, then flips the
 * row to completed pointing at that media (and, for a draft, its persisted
 * draft cache key). Any failure flips it to failed with the error and
 * rethrows. Called from the gen-video processor (async path) and the
 * awaiting tool variant in workflows (inline path). Notification
 * enqueueing happens only in the processor, never here.
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
    bucket: config.s3ImagesBucketName,
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
    draftCacheKey: result.draftCacheKey,
    // Actual outcome, not the request (specs/ai-labeling/prd.md "Failure
    // semantics"): overwrites the row's requested value with what the
    // upload actually stored, flipping it to false if the watermark attempt
    // failed.
    visibleWatermark: result.visibleWatermark,
  });

  return { ...updated, media: createdMedia };
}
