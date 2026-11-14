import { getGenImageRowsByIds, getGenVideoById } from '@repo/database';
import { logger } from '@repo/logger';
import { enqueueNotification } from '@repo/queue';

export type ImageGenerationNotificationType =
  | 'image_generation_succeeded'
  | 'image_generation_failed';

export type VideoGenerationNotificationType =
  | 'video_generation_succeeded'
  | 'video_generation_failed';

export interface NotifyImageGenerationParams {
  genImageIds: string[];
  type: ImageGenerationNotificationType;
}

export interface NotifyVideoGenerationParams {
  genVideoId: string;
  type: VideoGenerationNotificationType;
}

// Best-effort by design: a notification failure must never mask the job's
// real outcome (the rows and the rethrown/absent error already carry that),
// so every failure here is logged and swallowed. One notification per batch,
// not per row.
export async function notifyImageGenerationBestEffort({
  genImageIds,
  type,
}: NotifyImageGenerationParams): Promise<void> {
  try {
    const [record] = await getGenImageRowsByIds({ ids: genImageIds });
    if (!record) {
      logger.error(`Gen images ${genImageIds.join(', ')} not found, skipping notification`);
      return;
    }

    if (!record.userId) {
      logger.info(`Gen images ${genImageIds.join(', ')} have no author, skipping notification`);
      return;
    }

    await enqueueNotification({
      userId: record.userId,
      type,
      data: {
        genImageIds,
        workspaceId: record.workspaceId,
        prompt: record.prompt,
      },
    });
  } catch (notifyError) {
    logger.error(
      `Failed to enqueue ${type} notification for gen images ${genImageIds.join(', ')}:`,
      notifyError,
    );
  }
}

export async function notifyVideoGenerationBestEffort({
  genVideoId,
  type,
}: NotifyVideoGenerationParams): Promise<void> {
  try {
    const record = await getGenVideoById({ id: genVideoId });
    if (!record) {
      logger.error(`Gen video ${genVideoId} not found, skipping notification`);
      return;
    }

    if (!record.userId) {
      logger.info(`Gen video ${genVideoId} has no author, skipping notification`);
      return;
    }

    await enqueueNotification({
      userId: record.userId,
      type,
      data: {
        genVideoId: record.id,
        workspaceId: record.workspaceId,
        prompt: record.prompt,
      },
    });
  } catch (notifyError) {
    logger.error(
      `Failed to enqueue ${type} notification for gen video ${genVideoId}:`,
      notifyError,
    );
  }
}
