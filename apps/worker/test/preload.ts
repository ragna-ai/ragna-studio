// apps/worker/test/preload.ts (registered in bunfig.toml [test].preload)
//
// Re-registers every module mock from the worker's own resolution context.
// With injected workspace packages, @repo/testing is a frozen copy whose
// mock.module calls key on a different resolved path than the one the worker
// imports. See apps/api/test/preload.ts.
import {
  acquireTestSuiteLock,
  aiSdkProviderModuleMocks,
  mailModuleMock,
  mailProviderModuleMock,
  passGenerateImageThrough,
  queueModuleMock,
  storageModuleMock,
} from '@repo/testing';
import { mock } from 'bun:test';

mock.module('@repo/queue', () => queueModuleMock);
mock.module('@repo/storage', () => storageModuleMock);
for (const [specifier, moduleMock] of Object.entries(aiSdkProviderModuleMocks)) {
  mock.module(specifier, () => moduleMock);
}
mock.module('@repo/mail', () => mailModuleMock);
mock.module('@repo/mail/provider', () => mailProviderModuleMock);

passGenerateImageThrough();

await acquireTestSuiteLock();
