import { logger } from '@repo/logger';
import { sniffMediaKind, storeMedia, type MediaKind } from '@repo/media';
import { PROCESS_AGENT_IMAGE_JOB, processAgentImageJobSchema, queue } from '@repo/queue';
import { tryCatch } from '@repo/utils';
import {
  InternalServerErrorException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '../exceptions';
import { MB } from '../utils/upload-limits';

export const MAX_AGENT_IMAGE_BYTES = 2 * MB;

const AGENT_IMAGE_KINDS: readonly MediaKind[] = ['png', 'jpeg'];

export interface UploadedAgentImageResponse {
  mediaId: string;
}

/**
 * [POST] /workspace/:workspaceId/agent/image-upload
 * Stores the image as a workspace media row and queues the worker to scale it to the mark size.
 * The original is served until then. The row stays unreferenced until an agent saves it, so an
 * abandoned upload falls to the media sweep.
 */
export async function uploadAgentImage({
  workspaceId,
  file,
}: {
  workspaceId: string;
  file: File;
}): Promise<UploadedAgentImageResponse> {
  if (file.size > MAX_AGENT_IMAGE_BYTES) {
    throw new PayloadTooLargeException(`Image must be ${MAX_AGENT_IMAGE_BYTES / MB} MB or smaller`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMediaKind(buffer, file.name, { accept: AGENT_IMAGE_KINDS });

  if (!sniffed) {
    throw new UnsupportedMediaTypeException('Unsupported image type. Use PNG or JPEG.');
  }

  const { error, data: mediaRow } = await tryCatch(() =>
    storeMedia({
      owner: { workspaceId },
      buffer,
      filename: file.name,
      kind: sniffed.kind,
      origin: 'uploaded',
    }),
  );

  if (error !== null || !mediaRow) {
    logger.error('Failed to store agent image', error);
    throw new InternalServerErrorException('Failed to upload image');
  }

  await enqueueAgentImageResize(mediaRow.id);

  return { mediaId: mediaRow.id };
}

/** A failed enqueue only leaves the original image in place, so it is logged, not thrown. */
async function enqueueAgentImageResize(mediaId: string): Promise<void> {
  const { error } = await tryCatch(() =>
    queue.agentImage().add(PROCESS_AGENT_IMAGE_JOB, processAgentImageJobSchema.parse({ mediaId })),
  );

  if (error !== null) {
    logger.error(`Failed to enqueue agent image resize for media ${mediaId}`, error);
  }
}
