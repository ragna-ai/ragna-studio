// packages/testing/src/mocks/ai-sdk-provider.mock.ts
//
// Fakes the provider factories `@repo/ai` calls (createAnthropic, createOpenAI,
// createBlackForestLabs, createVertex) so they return the AI SDK's own V4 mock
// models. `generateText`, `generateImage`, `embedMany` and `generateVideo`
// stay real. Their `doGenerate`/`doEmbed` are exported mocks: use
// `mockImplementationOnce` for failure paths, `scriptModelOutput` for text.
import { mock } from 'bun:test';
import {
  MockEmbeddingModelV4,
  MockImageModelV4,
  MockLanguageModelV4,
  MockVideoModelV4,
} from 'ai/test';

type LanguageModelOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type LanguageGenerateFn = Extract<
  LanguageModelOptions['doGenerate'],
  (...args: never[]) => unknown
>;
type LanguageGenerateResult = Awaited<ReturnType<LanguageGenerateFn>>;
type ImageGenerateFn = MockImageModelV4['doGenerate'];
type VideoGenerateFn = NonNullable<MockVideoModelV4['doGenerate']>;
type EmbedFn = MockEmbeddingModelV4['doEmbed'];

export type FakeModelKind = 'language' | 'image' | 'video' | 'embedding';

export interface CreatedModel {
  kind: FakeModelKind;
  provider: string;
  modelId: string;
  model: MockLanguageModelV4 | MockImageModelV4 | MockVideoModelV4 | MockEmbeddingModelV4;
}

export interface ScriptedModelOutput {
  /** Plain text, or a JSON string for structured output. */
  text?: string;
  toolCalls?: { toolName: string; input: unknown }[];
  inputTokens?: number;
  outputTokens?: number;
}

export const FAKE_EMBEDDING_DIMENSIONS = 1536;

const DEFAULT_TEXT = 'scripted model output';
const DEFAULT_INPUT_TOKENS = 10;
const DEFAULT_OUTPUT_TOKENS = 5;

const scriptedOutputs: ScriptedModelOutput[] = [];
export const createdModels: CreatedModel[] = [];

function toLanguageResult(output: ScriptedModelOutput): LanguageGenerateResult {
  const inputTokens = output.inputTokens ?? DEFAULT_INPUT_TOKENS;
  const outputTokens = output.outputTokens ?? DEFAULT_OUTPUT_TOKENS;
  const toolCalls = output.toolCalls ?? [];

  return {
    content: [
      ...(output.text === undefined ? [] : [{ type: 'text' as const, text: output.text }]),
      ...toolCalls.map((toolCall, index) => ({
        type: 'tool-call' as const,
        toolCallId: `scripted-tool-call-${index}`,
        toolName: toolCall.toolName,
        input: JSON.stringify(toolCall.input),
      })),
    ],
    finishReason: { unified: toolCalls.length > 0 ? 'tool-calls' : 'stop', raw: undefined },
    usage: {
      inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
    },
    warnings: [],
  };
}

function defaultLanguageGenerate(): Promise<LanguageGenerateResult> {
  return Promise.resolve(toLanguageResult(scriptedOutputs.shift() ?? { text: DEFAULT_TEXT }));
}

function defaultImageGenerate(
  options: Parameters<ImageGenerateFn>[0],
): ReturnType<ImageGenerateFn> {
  const images = Array.from(
    { length: options.n },
    (_, index) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, index & 0xff]),
  );
  return Promise.resolve({
    images,
    warnings: [],
    response: { timestamp: new Date(), modelId: 'fake-image-model', headers: undefined },
  });
}

function defaultVideoGenerate(): ReturnType<VideoGenerateFn> {
  return Promise.resolve({
    videos: [
      { type: 'binary', data: new Uint8Array([0x00, 0x00, 0x00, 0x18]), mediaType: 'video/mp4' },
    ],
    warnings: [],
    response: { timestamp: new Date(), modelId: 'fake-video-model', headers: undefined },
  });
}

function defaultEmbed(options: Parameters<EmbedFn>[0]): ReturnType<EmbedFn> {
  return Promise.resolve({
    embeddings: options.values.map(() =>
      Array.from({ length: FAKE_EMBEDDING_DIMENSIONS }, () => 0.01),
    ),
    usage: { tokens: 0 },
    warnings: [],
  });
}

export const languageModelGenerateMock = mock(defaultLanguageGenerate);
export const imageModelGenerateMock = mock(defaultImageGenerate);
export const videoModelGenerateMock = mock(defaultVideoGenerate);
export const embeddingModelEmbedMock = mock(defaultEmbed);

/** Queues one language-model response. Responses are consumed in call order. */
export function scriptModelOutput(output: ScriptedModelOutput): void {
  scriptedOutputs.push(output);
}

export function lastCreatedModel(kind: FakeModelKind): CreatedModel | undefined {
  return createdModels.findLast((created) => created.kind === kind);
}

export function resetAiSdkProviderMock(): void {
  scriptedOutputs.length = 0;
  createdModels.length = 0;
  languageModelGenerateMock.mockClear();
  languageModelGenerateMock.mockImplementation(defaultLanguageGenerate);
  imageModelGenerateMock.mockClear();
  imageModelGenerateMock.mockImplementation(defaultImageGenerate);
  videoModelGenerateMock.mockClear();
  videoModelGenerateMock.mockImplementation(defaultVideoGenerate);
  embeddingModelEmbedMock.mockClear();
  embeddingModelEmbedMock.mockImplementation(defaultEmbed);
}

function record(created: CreatedModel): CreatedModel['model'] {
  createdModels.push(created);
  return created.model;
}

function buildProvider(provider: string) {
  const languageModel = (modelId: string) =>
    record({
      kind: 'language',
      provider,
      modelId,
      model: new MockLanguageModelV4({ provider, modelId, doGenerate: languageModelGenerateMock }),
    });
  const imageModel = (modelId: string) =>
    record({
      kind: 'image',
      provider,
      modelId,
      model: new MockImageModelV4({ provider, modelId, doGenerate: imageModelGenerateMock }),
    });
  const videoModel = (modelId: string) =>
    record({
      kind: 'video',
      provider,
      modelId,
      model: new MockVideoModelV4({ provider, modelId, doGenerate: videoModelGenerateMock }),
    });
  const embeddingModel = (modelId: string) =>
    record({
      kind: 'embedding',
      provider,
      modelId,
      model: new MockEmbeddingModelV4({ provider, modelId, doEmbed: embeddingModelEmbedMock }),
    });

  return Object.assign(languageModel, {
    languageModel,
    image: imageModel,
    imageModel,
    video: videoModel,
    videoModel,
    embedding: embeddingModel,
  });
}

export const aiSdkProviderModuleMocks: Record<string, Record<string, unknown>> = {
  '@ai-sdk/anthropic': { createAnthropic: () => buildProvider('anthropic') },
  '@ai-sdk/openai': { createOpenAI: () => buildProvider('openai') },
  '@ai-sdk/black-forest-labs': { createBlackForestLabs: () => buildProvider('bfl') },
  '@ai-sdk/google-vertex': { createVertex: () => buildProvider('google-vertex') },
};

for (const [specifier, moduleMock] of Object.entries(aiSdkProviderModuleMocks)) {
  mock.module(specifier, () => moduleMock);
}
