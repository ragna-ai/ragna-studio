import type { GenerateVideoInput } from '@repo/ai';
import { requestEnhanceGenVideo, requestGenVideo } from '@repo/ai';
import { config } from '@repo/config';
import type { GenVideo, GenVideoWithMedia } from '@repo/database';
import {
  deleteGenVideoByIdAndWorkspaceId,
  getGenImageByIdAndWorkspaceId,
  getGenVideoById,
  getGenVideoCountByWorkspaceId,
  getGenVideosByWorkspaceId,
} from '@repo/database';
import type { GenVideoFrameOrigin } from '@repo/database/schema';
import { logger } from '@repo/logger';
import { createMediaForObject, deleteMediaIfUnreferenced } from '@repo/media';
import { buildVideoUrls, getVideoFrameBucketNameForUser, uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export type GenVideoFrameInput =
  | { origin: 'genImage'; genImageId: string }
  | { origin: 'upload'; storageKey: string };

export interface GenVideoResponse {
  id: string;
  prompt: string;
  status: GenVideo['status'];
  error: string | null;
  aspectRatio: GenVideo['aspectRatio'];
  resolution: GenVideo['resolution'];
  duration: number | null;
  generateAudio: boolean;
  model: string;
  isDraft: boolean;
  parentGenVideoId: string | null;
  createdAt: Date;
  videoUrl?: string;
}

function toGenVideoResponse(record: GenVideoWithMedia): GenVideoResponse {
  return {
    id: record.id,
    prompt: record.prompt,
    status: record.status,
    error: record.error,
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    duration: record.duration,
    generateAudio: record.generateAudio,
    model: record.model,
    isDraft: record.isDraft,
    parentGenVideoId: record.parentGenVideoId,
    createdAt: record.createdAt,
    videoUrl:
      record.status === 'completed' && record.media
        ? buildVideoUrls({ userId: record.userId, key: record.media.storageKey }).videoUrl
        : undefined,
  };
}

/**
 * [GET] /workspace/:workspaceId/gen-video
 * Lists a workspace's generated videos, newest first by default.
 */
export async function listGenVideos({
  workspaceId,
  page,
  limit,
  sort,
}: {
  workspaceId: string;
  page?: number | null;
  limit?: number | null;
  sort?: 'asc' | 'desc';
}): Promise<{ genVideos: GenVideoResponse[]; meta: { totalCount: number } }> {
  const resolvedPage = page && page > 0 ? page : DEFAULT_PAGE;
  const resolvedLimit = limit && limit > 0 ? limit : DEFAULT_LIMIT;
  const offset = (resolvedPage - 1) * resolvedLimit;

  const { error, data: records } = await tryCatch(() =>
    getGenVideosByWorkspaceId({ workspaceId, limit: resolvedLimit, offset, sort }),
  );

  if (error !== null || !records) {
    logger.error('Failed to list generated videos', error);
    throw new InternalServerErrorException('Failed to list generated videos');
  }

  // Same filter as the list query above, so meta.totalCount matches it exactly.
  const { error: countError, data: totalCount } = await tryCatch(() =>
    getGenVideoCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null || totalCount === null) {
    logger.error('Failed to count generated videos', countError);
    throw new InternalServerErrorException('Failed to count generated videos');
  }

  return { genVideos: records.map(toGenVideoResponse), meta: { totalCount } };
}

/**
 * Mints a media row for an uploaded frame: the frame-upload endpoint below
 * already put the bytes in R2 and handed the client back a bare storage key
 * (docs/media-library/migration-prd.md non-goal: zero frontend changes), so
 * this is where that key finally gets its media row, mime type inferred
 * from the key's own extension (the same mapping the upload endpoint used
 * to name the file).
 */
async function createUploadedFrameMedia({
  workspaceId,
  storageKey,
}: {
  workspaceId: string;
  storageKey: string;
}): Promise<{ id: string }> {
  const extension = storageKey.split('.').pop() ?? '';
  const mimeType = FRAME_MIME_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';

  return createMediaForObject({
    owner: { workspaceId },
    bucket: config.cfImagesBucketName,
    storageKey,
    mimeType,
    origin: 'uploaded',
  });
}

/**
 * Resolves the optional first-frame input into the `frameOrigin` /
 * `frameMediaId` pair `requestGenVideo` (@repo/ai) expects. An `upload`
 * frame mints its own media row (its object already exists, from the
 * frame-upload endpoint below); a `genImage` frame links the referenced gen
 * image's existing media row (no copy), and is a workspace-scoped lookup so
 * a caller can't animate another workspace's image (docs/videogen/prd.md
 * decision 3).
 */
async function resolveFrame({
  frame,
  workspaceId,
}: {
  frame?: GenVideoFrameInput;
  workspaceId: string;
}): Promise<{ frameOrigin?: GenVideoFrameOrigin; frameMediaId?: string }> {
  if (!frame) {
    return {};
  }

  if (frame.origin === 'upload') {
    const mediaRow = await createUploadedFrameMedia({ workspaceId, storageKey: frame.storageKey });
    return { frameOrigin: 'upload', frameMediaId: mediaRow.id };
  }

  const { error, data: genImage } = await tryCatch(() =>
    getGenImageByIdAndWorkspaceId({ id: frame.genImageId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load frame image', error);
    throw new InternalServerErrorException('Failed to load frame image');
  }

  if (!genImage) {
    throw new NotFoundException('Frame image not found in this workspace');
  }

  return { frameOrigin: 'genImage', frameMediaId: genImage.mediaId };
}

// createGenVideoRecord (@repo/ai) throws a plain Error (repo convention,
// no typed error classes there) when the resolved provider's capability map
// rejects the request: unsupported aspect ratio, out-of-range duration, or
// a seed/negativePrompt/draft the provider doesn't support
// (docs/videogen/prd-v2.md decision 5). All of these messages start with
// "Provider ", which is the only signal available to tell them apart from
// a genuine infra failure, mirroring isInvalidAfterTaskIdError in
// task.service.ts. They are a bad request, not a server error, so they
// surface as 400 instead of falling into the generic 500 below.
function isCapabilityViolationError(error: Error): boolean {
  return error.message.startsWith('Provider ');
}

/**
 * [POST] /workspace/:workspaceId/gen-video
 * Requests a video generation: inserts a pending row and enqueues the
 * render job (requestGenVideo in @repo/ai), then responds immediately. The
 * worker does the slow part (docs/videogen/prd.md). `requestGenVideo`'s own
 * result only carries a few fields (id/status/prompt/error/videoUrl/
 * createdAt), so the full row is re-read here to fill out the response
 * contract's aspectRatio/resolution/duration/generateAudio/model.
 */
export async function generateVideoForWorkspace({
  userId,
  workspaceId,
  input,
}: {
  userId: string;
  workspaceId: string;
  input: GenerateVideoInput & { frame?: GenVideoFrameInput };
}): Promise<{ genVideo: GenVideoResponse }> {
  const {
    frame,
    prompt,
    provider,
    model,
    aspectRatio,
    resolution,
    duration,
    generateAudio,
    seed,
    negativePrompt,
    draft,
  } = input;

  const { frameOrigin, frameMediaId } = await resolveFrame({ frame, workspaceId });

  const { error, data: created } = await tryCatch(() =>
    requestGenVideo({
      prompt,
      provider,
      model,
      aspectRatio,
      resolution,
      duration,
      generateAudio,
      seed,
      negativePrompt,
      draft,
      frameOrigin,
      frameMediaId,
      userId,
      workspaceId,
    }),
  );

  if (error !== null || !created) {
    if (error !== null && isCapabilityViolationError(error)) {
      throw new BadRequestException(error.message);
    }

    logger.error('Failed to request video generation', error);
    throw new InternalServerErrorException('Failed to request video generation');
  }

  const { error: loadError, data: record } = await tryCatch(() =>
    getGenVideoById({ id: created.id }),
  );

  if (loadError !== null || !record) {
    logger.error('Failed to load the created gen video', loadError);
    throw new InternalServerErrorException('Failed to request video generation');
  }

  return { genVideo: toGenVideoResponse(record) };
}

// requestEnhanceGenVideo (@repo/ai) throws a plain Error for each of its
// three failure cases (repo convention, no typed error classes there);
// matched by message the same way, since that is the only signal available
// (docs/videogen/prd-v2.md "API (apps/api)"):
// - not found in the caller's workspace -> 404, same as any other
//   workspace-scoped lookup miss in this file.
// - not a completed BFL draft -> 400, an invalid-state request, mirroring
//   isInvalidAfterTaskIdError/isInvalidAfterRowIdError in task.service.ts
//   and dataset.service.ts.
// - already has a pending/completed enhance -> 409, the same conflict
//   status runChatStream uses for its own one-in-flight check.
function isEnhanceTargetNotFoundError(error: Error): boolean {
  return error.message.includes('not found in workspace');
}

function isEnhanceAlreadyExistsError(error: Error): boolean {
  return error.message.includes('already has a pending or completed enhance');
}

function isNotEnhanceableDraftError(error: Error): boolean {
  return error.message.includes('is not a BFL draft') || error.message.includes('is not a completed draft');
}

/**
 * [POST] /workspace/:workspaceId/gen-video/:genVideoId/enhance
 * Turns a completed BFL draft into a new pending row that re-renders it at
 * full quality (requestEnhanceGenVideo in @repo/ai), then responds
 * immediately like generateVideoForWorkspace above. Reloads the full row
 * for the same reason: requestEnhanceGenVideo's own GenVideoDto only
 * carries a few fields, and the response contract needs
 * aspectRatio/resolution/duration/generateAudio/model too.
 */
export async function enhanceGenVideoForWorkspace({
  genVideoId,
  userId,
  workspaceId,
}: {
  genVideoId: string;
  userId: string;
  workspaceId: string;
}): Promise<{ genVideo: GenVideoResponse }> {
  const { error, data: enhanced } = await tryCatch(() =>
    requestEnhanceGenVideo({ genVideoId, userId, workspaceId }),
  );

  if (error !== null || !enhanced) {
    if (error !== null && isEnhanceTargetNotFoundError(error)) {
      throw new NotFoundException(error.message);
    }

    if (error !== null && isEnhanceAlreadyExistsError(error)) {
      throw new ConflictException(error.message);
    }

    if (error !== null && isNotEnhanceableDraftError(error)) {
      throw new BadRequestException(error.message);
    }

    logger.error('Failed to request video enhance', error);
    throw new InternalServerErrorException('Failed to request video enhance');
  }

  const { error: loadError, data: record } = await tryCatch(() =>
    getGenVideoById({ id: enhanced.id }),
  );

  if (loadError !== null || !record) {
    logger.error('Failed to load the created enhance gen video', loadError);
    throw new InternalServerErrorException('Failed to request video enhance');
  }

  return { genVideo: toGenVideoResponse(record) };
}

/**
 * [DELETE] /workspace/:workspaceId/gen-video/:genVideoId
 * Deletes the row, then refcount-deletes its output media and its frame
 * media (docs/media-library/migration-prd.md decision 5): a 'genImage'
 * frame shares its media row with that gen_images row, so it only
 * disappears once nothing references it anymore, mirroring imagegen's
 * deleteGenImage. Either mediaId may be null (a pending row has no output
 * yet; a text-to-video request has no frame at all).
 */
export async function deleteGenVideo({
  workspaceId,
  genVideoId,
}: {
  workspaceId: string;
  genVideoId: string;
}): Promise<void> {
  const { error, data: deleted } = await tryCatch(() =>
    deleteGenVideoByIdAndWorkspaceId({ id: genVideoId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to delete generated video', error);
    throw new InternalServerErrorException('Failed to delete generated video');
  }

  if (!deleted) {
    throw new NotFoundException('Generated video not found');
  }

  const mediaIds = [deleted.mediaId, deleted.frameMediaId].filter(
    (mediaId): mediaId is string => mediaId !== null,
  );

  await Promise.all(mediaIds.map((mediaId) => deleteMediaIfUnreferenced({ mediaId })));
}

// Same 10 MB cap as social-post media uploads
// (social-post-media.service.ts), plus WEBP since first-frame images may
// come from more varied sources than a social post attachment.
const FRAME_EXTENSION_BY_MIME_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
type AllowedFrameMimeType = keyof typeof FRAME_EXTENSION_BY_MIME_TYPE;
const MAX_FRAME_FILE_BYTES = 10 * 1024 * 1024;

// Reverse of the map above, for resolveFrame's 'upload' branch: by the time
// a generate request resolves an uploaded frame, only the storage key (and
// thus its extension) survives the round trip to the client and back.
const FRAME_MIME_TYPE_BY_EXTENSION: Record<string, AllowedFrameMimeType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

function isAllowedFrameMimeType(mimeType: string): mimeType is AllowedFrameMimeType {
  return mimeType in FRAME_EXTENSION_BY_MIME_TYPE;
}

/**
 * [POST] /workspace/:workspaceId/gen-video/frame-upload
 * Uploads a first-frame image for image-to-video generation, following the
 * social post media upload pattern: validate, buffer, upload to R2 under
 * the user's video-frame prefix, hand back the storage key for the create
 * call above to reference.
 */
export async function uploadGenVideoFrame({
  userId,
  file,
}: {
  userId: string;
  file: File;
}): Promise<{ storageKey: string }> {
  if (!isAllowedFrameMimeType(file.type)) {
    throw new BadRequestException('Unsupported image type. Use PNG, JPEG, or WEBP.');
  }

  if (file.size > MAX_FRAME_FILE_BYTES) {
    throw new BadRequestException('Image must be 10 MB or smaller');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { bucketName, prefix } = getVideoFrameBucketNameForUser(userId);
  const key = `${prefix}/${randomUUID()}.${FRAME_EXTENSION_BY_MIME_TYPE[file.type]}`;

  const { error } = await tryCatch(() =>
    uploadObjectBuffer({ bucketName, key, buffer, contentType: file.type }),
  );

  if (error !== null) {
    logger.error('Failed to upload video frame image', error);
    throw new InternalServerErrorException('Failed to upload frame image');
  }

  return { storageKey: key };
}
