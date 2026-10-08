import { getGenImageRowsByIds } from '@repo/database';
import { toPublicMediaUrl } from '@repo/storage';
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
  createGenImagesWithDefaultModel,
  imageGenAspectRatios,
  requestGenImagesWithDefaultModel,
} from '../services/imagen.service';

const imageGenInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(5000)
    .describe(
      'A detailed description of the image to generate. Prefer fluent english language using your own words.',
    ),
  aspectRatio: z
    .enum(imageGenAspectRatios)
    .optional()
    .describe('The aspect ratio of the image. Defaults to 1:1.'),
  n: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe('The number of images to generate. Defaults to 1.'),
  seed: z
    .number()
    .int()
    .optional()
    .describe(
      'Seed for reproducible generations. Silently ignored if the selected model does not support it.',
    ),
  negativePrompt: z
    .string()
    .max(5000)
    .optional()
    .describe(
      'Content to exclude from the image. Silently ignored if the selected model does not support it.',
    ),
});

type ImageGenInput = z.infer<typeof imageGenInputSchema>;

export type GeneratedAgentImage = {
  id: string;
  imgUrl: string;
};

// The pending branch is decision 6's poll-cap fallback (specs/imagegen/
// worker-execution-prd.md): the chat path waited up to POLL_TIMEOUT_MS and
// the batch still hadn't settled, so the ids are handed back instead of a
// URL the model doesn't have yet, the same degrade-to-pending shape the
// video tool always returns.
type ImageGenOutput =
  | { images: GeneratedAgentImage[] }
  | { pending: { ids: string[] } }
  | { error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Chat-path poll cap: a
// batch normally settles in a few seconds, so 1s steps keep the poll
// responsive without hammering the DB, and 60s is far above a realistic
// batch's ceiling before degrading to the pending-ids fallback.
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

function isSettled(status: string): boolean {
  return status === 'completed' || status === 'failed';
}

/**
 * Polls gen_images rows by status until every row in the batch reaches a
 * terminal state or the cap is hit, reading the same rows the web grid polls:
 * no QueueEvents, no
 * awaited job, just the pending-row model videogen already ships.
 */
async function pollGenImagesUntilSettled(genImageIds: string[]) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const rows = await getGenImageRowsByIds({ ids: genImageIds });

    if (rows.every((row) => isSettled(row.status))) {
      return rows;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return getGenImageRowsByIds({ ids: genImageIds });
}

function toGeneratedAgentImages(
  rows: { id: string; media: { storageKey: string } | null }[],
): GeneratedAgentImage[] {
  // Defensive filter, not an expected branch: a 'completed' row always has
  // its media set by runGenImages before the status flips
  // (imagen.service.ts), so this only ever drops rows in the (unreachable in
  // practice) case where that invariant doesn't hold.
  return rows.flatMap((row) => {
    if (!row.media) return [];
    const imgUrl = toPublicMediaUrl(row.media.storageKey);
    return [{ id: row.id, imgUrl }];
  });
}

// runsInWorker (already inside the worker: workflow executors) inserts the
// batch and runs it inline, no queue hop. Otherwise (chat, running in the
// API process) the request side enqueues the batch onto the worker and this
// polls the rows until they settle or the cap is hit:
// the one deviation from
// videogen's tool, since inline images are this tool's whole point and a
// batch only takes seconds, not minutes.
async function generateAgentImages({
  input,
  userId,
  workspaceId,
  runsInWorker,
}: {
  input: ImageGenInput;
  userId: string;
  workspaceId: string;
  runsInWorker: boolean;
}): Promise<ImageGenOutput> {
  if (runsInWorker) {
    const rows = await createGenImagesWithDefaultModel({ ...input, userId, workspaceId });
    return { images: toGeneratedAgentImages(rows) };
  }

  const pending = await requestGenImagesWithDefaultModel({ ...input, userId, workspaceId });
  const genImageIds = pending.map((row) => row.id);
  const settled = await pollGenImagesUntilSettled(genImageIds);

  const failed = settled.find((row) => row.status === 'failed');
  if (failed) {
    return { error: failed.error ?? 'Image generation failed.' };
  }

  if (settled.every((row) => row.status === 'completed')) {
    return { images: toGeneratedAgentImages(settled) };
  }

  // Cap reached with the batch still pending/processing: degrade to
  // videogen's pending-ids behavior, the images will show up in the library
  // once the worker finishes.
  return { pending: { ids: genImageIds } };
}

const awaitedDescription =
  'Use this tool to generate one or more images from a text prompt. This call waits for the ' +
  'render to finish and returns the image URLs.';

const asyncDescription =
  'Use this tool to generate one or more images from a text prompt. It returns URLs of the ' +
  'generated images, which are also shown to the user directly. Generation usually finishes in ' +
  'a few seconds; in the rare case it takes longer than a minute, this tool returns pending ' +
  "image ids instead and the images appear in the user's image library shortly after. Tell the " +
  "user the images are still being generated in that case, don't claim they're ready.";

export const getGeneratedImages = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
  runsInWorker: boolean,
): Tool<ImageGenInput, ImageGenOutput> =>
  tool({
    description: runsInWorker ? awaitedDescription : asyncDescription,
    inputSchema: imageGenInputSchema,
    execute: async (input) => {
      // emit tool usage message
      writer.write({
        type: 'data-imageGen',
        data: { prompt: input.prompt },
        transient: true,
      });

      // seed/negativePrompt pass straight through: this tool resolves its
      // model via getDefaultAiModelByModality and never sees
      // ai_models.capabilities, so generateAgentImages' underlying calls are
      // what drop either field for a model that doesn't support it (fail
      // closed, specs/imagegen/prd.md decision 7) rather than erroring.
      const { error, data: output } = await tryCatch(
        () => generateAgentImages({ input, userId, workspaceId, runsInWorker }),
        { retryOnFailure: false },
      );

      if (error !== null || output === null) {
        return { error: 'Image generation failed. Service currently unavailable.' };
      }

      return output;
    },
  });

export type getGeneratedImagesInput = InferToolInput<ReturnType<typeof getGeneratedImages>>;
export type getGeneratedImagesOutput = InferToolOutput<ReturnType<typeof getGeneratedImages>>;
export type ImageGenUiTool = InferUITool<ReturnType<typeof getGeneratedImages>>;
