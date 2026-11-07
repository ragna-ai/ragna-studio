import { buildAgentToolset, type UIMessageStreamWriter } from '@repo/ai';
import { createAiModel } from '@repo/database';
import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedImageAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { stubToolExecutionOptions } from '../stub-tool-execution-options';

type UIMessageChunk = Parameters<UIMessageStreamWriter['write']>[0];

const PROMPT = 'a red bicycle at sunset';

function recordingWriter(chunks: UIMessageChunk[]): UIMessageStreamWriter {
  return {
    write: (chunk) => {
      chunks.push(chunk);
    },
    merge: () => {},
    onError: undefined,
  };
}

async function seedVideoAiModel(): Promise<void> {
  await createAiModel({
    provider: 'google-vertex',
    model: `test-video-model-${crypto.randomUUID()}`,
    modality: 'video',
    family: 'diffusion',
    size: 'medium',
    displayName: 'Test Video Model',
    description: 'Seeded for media tool tests.',
    pricing: null,
    capabilities: {},
    meta: {},
  });
}

describe('media tool stream events', () => {
  beforeEach(async () => {
    resetProviderMocks();
    await truncateAllTables();
  });

  test('imageGen announces the prompt as a transient data part', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedImageAiModel();
    const chunks: UIMessageChunk[] = [];
    const tools = buildAgentToolset([{ id: 'imageGen' }], {
      writer: recordingWriter(chunks),
      userId,
      workspaceId,
      agentId: 'agent-1',
      runsInWorker: true,
    });

    const execute = tools.imageGen?.execute;
    if (!execute) throw new Error('imageGen has no execute');
    await execute({ prompt: PROMPT }, stubToolExecutionOptions);

    expect(chunks).toEqual([{ type: 'data-imageGen', data: { prompt: PROMPT }, transient: true }]);
  });

  test('videoGen announces the prompt as a transient data part', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedVideoAiModel();
    const chunks: UIMessageChunk[] = [];
    const tools = buildAgentToolset([{ id: 'videoGen' }], {
      writer: recordingWriter(chunks),
      userId,
      workspaceId,
      agentId: 'agent-1',
    });

    const execute = tools.videoGen?.execute;
    if (!execute) throw new Error('videoGen has no execute');
    const result = await execute({ prompt: PROMPT }, stubToolExecutionOptions);

    expect(chunks).toEqual([{ type: 'data-videoGen', data: { prompt: PROMPT }, transient: true }]);
    expect(result).toMatchObject({ video: { status: 'pending' } });
  });

  test('videoGen returns a failure the model can act on for an unknown reference image', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const tools = buildAgentToolset([{ id: 'videoGen' }], {
      writer: recordingWriter([]),
      userId,
      workspaceId,
      agentId: 'agent-1',
    });

    const execute = tools.videoGen?.execute;
    if (!execute) throw new Error('videoGen has no execute');
    const result = await execute(
      { prompt: PROMPT, genImageId: 'missing-image' },
      stubToolExecutionOptions,
    );

    expect(result).toMatchObject({ status: 'image_not_found' });
  });
});
