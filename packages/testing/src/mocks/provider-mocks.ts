// packages/testing/src/mocks/provider-mocks.ts
//
// Registers every external-provider mock (see ai-provider.mock.ts,
// storage-provider.mock.ts, linkedin-provider.mock.ts) and exposes one
// combined reset for a consuming app's test `beforeEach`, alongside
// `truncateAllTables()`. Resetting matters because a test may install a
// one-off failure via `mockImplementationOnce` (or a full
// `mockImplementation` override); without a reset that would leak into the
// next test in the same file.
//
// Any test file that exercises a mocked boundary must import this (or
// `@repo/testing` as a whole) before its own import of anything that
// transitively reaches the real `ai`/`@repo/storage`/`@repo/linkedin`
// modules (e.g. the app entrypoint). No dedicated preload is needed for
// this ordering: Bun finishes importing every test file — running each
// one's top-level code, this mock registration included — before executing
// any test body, so registration applies process-wide once any file
// triggers it. See apps/api/test/README.md, "External-provider mocks".
import { resetAiProviderMock } from './ai-provider.mock';
import { resetLinkedinProviderMock } from './linkedin-provider.mock';
import { resetQueueMock } from './queue-provider.mock';
import { resetStorageProviderMock } from './storage-provider.mock';

export * from './ai-provider.mock';
export * from './linkedin-provider.mock';
export * from './queue-provider.mock';
export * from './storage-provider.mock';

export function resetProviderMocks(): void {
  resetAiProviderMock();
  resetStorageProviderMock();
  resetLinkedinProviderMock();
  resetQueueMock();
}
