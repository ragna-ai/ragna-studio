import type { GenerateVideoInput } from '@repo/ai';
import { requestGenVideo } from '@repo/ai';
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
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';

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
      frameOrigin,
      frameMediaId,
      userId,
      workspaceId,
    }),
  );

  if (error !== null || !created) {
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
