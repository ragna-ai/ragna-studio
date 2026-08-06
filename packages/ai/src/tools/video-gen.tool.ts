import { getGenImageByIdAndWorkspaceId } from '@repo/database';
import { buildVideoUrls } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import type {
  InferToolInput,
  InferToolOutput,
  InferUITool,
  Tool,
  UIMessage,
  UIMessageStreamWriter,
} from 'ai';
import { tool } from 'ai';
import * as z from 'zod';
import {
  createGenVideoRecord,
  requestGenVideo,
  runGenVideo,
  videoGenAspectRatios,
} from '../services/videogen.service';

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

type VideoGenInput = z.infer<typeof videoGenInputSchema>;

type GeneratedAgentVideo = {
  id: string;
  status: 'pending' | 'completed';
  videoUrl?: string;
};

type VideoGenOutput = { video: GeneratedAgentVideo } | { error: string };

// Chat (runsInWorker: false/undefined) enqueues and returns immediately: the
// multi-minute render never blocks the stream, and a dropped stream can't
// orphan a generation. Workflows (runsInWorker: true) already run inside the
// worker process and need the finished video for downstream steps, so they
// await runGenVideo inline instead (docs/videogen/prd.md decision 2).
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

export const getGeneratedVideo = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
  runsInWorker: boolean,
): Tool<VideoGenInput, VideoGenOutput> =>
  tool({
    description: runsInWorker ? awaitedDescription : asyncDescription,
    inputSchema: videoGenInputSchema,
    execute: async (input): Promise<VideoGenOutput> => {
      // emit tool usage message
      writer.write({
        type: 'data-videoGen',
        data: { prompt: input.prompt },
        transient: true,
      });

      let frame: { frameOrigin: 'genImage'; frameMediaId: string } | undefined;

      if (input.genImageId) {
        const { error, data: genImage } = await tryCatch(
          () => getGenImageByIdAndWorkspaceId({ id: input.genImageId as string, workspaceId }),
          { retryOnFailure: false },
        );

        // mediaId is null for a pending/processing/failed row
        // (docs/imagegen/worker-execution-prd.md decision 1): a generation
        // that hasn't produced an object yet has no frame to animate.
        if (error !== null || !genImage || !genImage.mediaId) {
          return { error: 'The referenced image was not found in this workspace.' };
        }

        frame = { frameOrigin: 'genImage', frameMediaId: genImage.mediaId };
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
        const { error: createError, data: record } = await tryCatch(
          () => createGenVideoRecord(params),
          { retryOnFailure: false },
        );

        if (createError !== null || !record) {
          return { error: 'Video generation failed to start.' };
        }

        const { error: runError, data: completed } = await tryCatch(
          () => runGenVideo({ genVideoId: record.id }),
          { retryOnFailure: false },
        );

        if (runError !== null || !completed) {
          return { error: 'Video generation failed. Service currently unavailable.' };
        }

        const videoUrl = completed.media
          ? buildVideoUrls({ userId, key: completed.media.storageKey }).videoUrl
          : undefined;

        return { video: { id: completed.id, status: 'completed', videoUrl } };
      }

      const { error, data: requested } = await tryCatch(() => requestGenVideo(params), {
        retryOnFailure: false,
      });

      if (error !== null || !requested || requested.status === 'failed') {
        return { error: 'Video generation failed to start.' };
      }

      return { video: { id: requested.id, status: 'pending' } };
    },
  });

export type getGeneratedVideoInput = InferToolInput<ReturnType<typeof getGeneratedVideo>>;
export type getGeneratedVideoOutput = InferToolOutput<ReturnType<typeof getGeneratedVideo>>;
export type VideoGenUiTool = InferUITool<ReturnType<typeof getGeneratedVideo>>;
