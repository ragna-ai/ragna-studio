// packages/ai/src/index.ts

// AI_SDK_LOG_WARNINGS=false in the env silences the AI SDK's own
// console.warn logging of provider warnings (e.g. "AI SDK Warning
// (black-forest-labs.video / flux-3-video): The feature \"prompt\" is not
// supported..." on every draft-enhance run: the SDK's call shape requires
// `prompt`, BFL's draft_enhance mode ignores it, known-benign). The SDK
// only reads the JS global, not the env, so @repo/config bridges the env
// var here. Where a warning is actually worth seeing (e.g.
// imagen.service.ts's OpenAI-ignores-seed case), the service reads
// `result.warnings` itself and reports it through @repo/logger, which this
// does not touch. Must run before any generate call, so it sits above
// every other export in this file. The `AI_SDK_LOG_WARNINGS` global is
// declared by the `ai` package itself (dist/index.d.ts), picked up
// automatically once anything here imports from 'ai', so no local
// `declare global` is needed.
import { config } from '@repo/config';

if (!config.aiSdkLogWarnings) {
  globalThis.AI_SDK_LOG_WARNINGS = false;
}

export {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateImage,
  generateText,
  safeValidateUIMessages,
  smoothStream,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
} from 'ai';
export type { ToolSet } from 'ai';
// Consumers defining their own AI SDK tools (e.g. workflow executors) need
// the same zod this package's own tool schemas use, without a direct zod
// dependency of their own.
export * as z from 'zod';
export * from './client';
export * from './factories';
export * from './services';
export * from './tools';
export * from './types';
export * from './usage';
