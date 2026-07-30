// packages/testing/src/mocks/ai-provider.mock.ts
//
// Mocks the `ai` npm package itself, not `@repo/ai`. `@repo/ai` is bundled
// by tsdown with no `noExternal`, so real npm deps like `ai` stay external,
// unbundled imports in its dist output: mocking `@repo/ai` at the package
// specifier level would never reach the `generateImage` call inside
// packages/ai/src/services/imagen.service.ts, since after bundling that's
// just a local function call, not a re-resolved import. Mocking `ai` itself
// works because Bun's module registry is global: `@repo/ai`'s dist and the
// test process both resolve `ai` to the same real npm package.
//
// Lives here (not app-local) so both apps/api and apps/worker's test
// suites can register the same fake: apps/worker's gen-video processor
// calls `runGenVideo` (@repo/ai), which hits this exact `ai` export.
//
// Only `generateImage` is faked, since that's the only `ai` export
// apps/api's own routes exercise today (imagegen). `experimental_
// generateVideo` (used by `runGenVideo`, an apps/worker concern) isn't
// faked yet; add it here, following the same pattern, once a worker test
// needs it. Spreading the real module below keeps everything else `ai`
// exports (tool, streamText, generateText, ...) real, so chat/agent/
// workflow code that imports other `ai` exports keeps working unmocked.
import { mock } from 'bun:test';
import * as aiPackage from 'ai';

type GenerateImageFn = typeof aiPackage.generateImage;
type GenerateImageParams = Parameters<GenerateImageFn>[0];
type GenerateImageResult = Awaited<ReturnType<GenerateImageFn>>;

function fakeGeneratedImage(seed: number): GenerateImageResult['images'][number] {
  return {
    uint8Array: new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed & 0xff]),
    base64: '',
    mediaType: 'image/png',
  } as GenerateImageResult['images'][number];
}

function defaultGenerateImageImpl(params: GenerateImageParams): Promise<GenerateImageResult> {
  const n = params.n ?? 1;
  return Promise.resolve({
    images: Array.from({ length: n }, (_, index) => fakeGeneratedImage(index)),
    warnings: [],
    providerMetadata: undefined,
    responses: [],
  } as unknown as GenerateImageResult);
}

export const generateImageMock = mock<GenerateImageFn>(defaultGenerateImageImpl);

export function resetAiProviderMock(): void {
  generateImageMock.mockClear();
  generateImageMock.mockImplementation(defaultGenerateImageImpl);
}

mock.module('ai', () => ({
  ...aiPackage,
  generateImage: generateImageMock,
}));
