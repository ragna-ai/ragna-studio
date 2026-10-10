import { embedTexts, generateText, getLanguageModel, runGenImages, runGenVideo } from '@repo/ai';
import { createGenImageRecords, createGenVideoRecord, getGenVideoById } from '@repo/database';
import {
  FAKE_EMBEDDING_DIMENSIONS,
  imageModelGenerateMock,
  lastCreatedModel,
  resetProviderMocks,
  scriptModelOutput,
  seedAuthenticatedUser,
  truncateAllTables,
  uploadObjectBufferMock,
  videoModelGenerateMock,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

describe('AI SDK provider mocks', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('getLanguageModel serves the scripted output and usage', async () => {
    scriptModelOutput({ text: 'hello from the script', inputTokens: 123, outputTokens: 45 });

    const result = await generateText({
      model: getLanguageModel({ provider: 'anthropic', model: 'claude-sonnet-5' }),
      prompt: 'say hi',
    });

    expect(result.text).toBe('hello from the script');
    expect(result.usage.inputTokens).toBe(123);
    expect(result.usage.outputTokens).toBe(45);
    expect(lastCreatedModel('language')?.modelId).toBe('claude-sonnet-5');
  });

  test('embedTexts gets fake embeddings', async () => {
    const embeddings = await embedTexts(['one', 'two']);

    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toHaveLength(FAKE_EMBEDDING_DIMENSIONS);
  });

  test('runGenImages renders through the fake image model', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const rows = await createGenImageRecords([
      { userId, workspaceId, prompt: 'a red bicycle', provider: 'bfl', model: 'flux-pro' },
    ]);

    const completed = await runGenImages({ genImageIds: rows.map((row) => row.id) });

    expect(completed).toHaveLength(1);
    expect(imageModelGenerateMock).toHaveBeenCalledTimes(1);
    expect(uploadObjectBufferMock).toHaveBeenCalledTimes(1);
  });

  test('runGenVideo renders through the fake video model', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const row = await createGenVideoRecord({
      userId,
      workspaceId,
      prompt: 'a drone shot over a city',
      provider: 'bfl',
      model: 'flux-3-video',
    });

    await runGenVideo({ genVideoId: row.id });

    const updated = await getGenVideoById({ id: row.id });
    expect(updated?.status).toBe('completed');
    expect(videoModelGenerateMock).toHaveBeenCalledTimes(1);
    expect(uploadObjectBufferMock).toHaveBeenCalledTimes(1);
  });
});
