import { getGenImageByIdAndWorkspaceId } from '@repo/database';
import { toPublicMediaUrl } from '@repo/storage';
import * as z from 'zod';
import {
  createGenVideoRecord,
  requestGenVideo,
  runGenVideo,
  videoGenAspectRatios,
} from '../services/videogen.service';
import type { ToolDefinition, ToolFailure } from './tool-definition';

const videoGenInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(5000)
    .describe(
      'A detailed description of the video to generate. Prefer fluent english language using your own words.',
    ),
  aspectRatio: z
    .enum(videoGenAspectRatios)
    .optional()
    .describe('The aspect ratio of the video. Defaults to 16:9.'),
  duration: z
    .union([z.literal(4), z.literal(6), z.literal(8)])
    .optional()
    .describe('The duration of the video in seconds (4, 6, or 8). Defaults to 4.'),
  generateAudio: z
    .boolean()
    .optional()
    .describe('Whether to generate audio alongside the video. Defaults to true.'),
  genImageId: z
    .string()
    .optional()
    .describe(
      "The id of a previously generated image (from the image generation tool) to animate as the video's first frame. Omit for a plain text-to-video generation.",
    ),
});

type GeneratedAgentVideo = {
  id: string;
  status: 'pending' | 'completed';
  videoUrl?: string;
};

type VideoGenOutput =
  | { video: GeneratedAgentVideo }
  | ToolFailure<'image_not_found' | 'generation_failed'>;

// Chat (runsInWorker: false/undefined) enqueues and returns immediately: the
// multi-minute render never blocks the stream, and a dropped stream can't
// orphan a generation. Workflows (runsInWorker: true) already run inside the
// worker process and need the finished video for downstream steps, so they
// await runGenVideo inline instead.
const asyncDescription =
  'Use this tool to generate a video from a text prompt, optionally animating a previously ' +
  'generated image as its first frame. Generation is asynchronous and takes anywhere from ' +
  'roughly 30 seconds to a few minutes: this tool returns a pending id right away, and the ' +
  "finished video appears in the user's video gallery plus a notification once it's ready. " +
  'Tell the user the video is being generated, do not claim it is ready yet.';

const awaitedDescription =
  'Use this tool to generate a video from a text prompt, optionally animating a previously ' +
  'generated image as its first frame. This call waits for the render to finish and returns ' +
  'the finished video URL.';

export interface VideoGenToolOptions {
  runsInWorker: boolean;
}

interface VideoFrame {
  frameOrigin: 'genImage';
  frameMediaId: string;
}

/** The first frame of an image-to-video call, or undefined when the image can't be animated. */
async function findImageFrame(
  genImageId: string,
  workspaceId: string,
): Promise<VideoFrame | undefined> {
  const genImage = await getGenImageByIdAndWorkspaceId({ id: genImageId, workspaceId });
  // mediaId is null for a pending/processing/failed row: it has no frame to animate yet.
  if (!genImage?.mediaId) return undefined;
  return { frameOrigin: 'genImage', frameMediaId: genImage.mediaId };
}

const imageNotFoundFailure: ToolFailure<'image_not_found'> = {
  status: 'image_not_found',
  message: 'The referenced image was not found in this workspace or has not finished generating.',
};

const generationFailedFailure: ToolFailure<'generation_failed'> = {
  status: 'generation_failed',
  message: 'Video generation failed to start. Tell the user and try again later.',
};

export function videoGenToolDefinition({
  runsInWorker,
}: VideoGenToolOptions): ToolDefinition<typeof videoGenInputSchema, VideoGenOutput> {
  return {
    name: 'videoGen',
    description: runsInWorker ? awaitedDescription : asyncDescription,
    inputSchema: videoGenInputSchema,
    access: 'write',
    uiEvent: (input) => ({ type: 'data-videoGen', data: { prompt: input.prompt } }),
    execute: async (input, { userId, workspaceId }) => {
      let frame: VideoFrame | undefined;

      if (input.genImageId) {
        frame = await findImageFrame(input.genImageId, workspaceId);
        if (!frame) return imageNotFoundFailure;
      }

      const params = {
        userId,
        workspaceId,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        duration: input.duration,
        generateAudio: input.generateAudio,
        frameOrigin: frame?.frameOrigin,
        frameMediaId: frame?.frameMediaId,
      };

      if (runsInWorker) {
        const record = await createGenVideoRecord(params);
        const completed = await runGenVideo({ genVideoId: record.id });
        const videoUrl = completed.media ? toPublicMediaUrl(completed.media.storageKey) : undefined;
        return { video: { id: completed.id, status: 'completed', videoUrl } };
      }

      const requested = await requestGenVideo(params);
      if (requested.status === 'failed') return generationFailedFailure;
      return { video: { id: requested.id, status: 'pending' } };
    },
  };
}
