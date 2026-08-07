// apps/api/test/preload.ts (registered in bunfig.toml [test].preload)
//
// Re-registers the LinkedIn mock from apps/api's own module-resolution
// context. With injectWorkspacePackages on, @repo/testing is materialized
// as a frozen copy under node_modules/.pnpm/, and a mock.module call made
// inside that copy keys on a different resolved path for '@repo/linkedin'
// than the one this app's code imports (the mock file resolves it to the
// injected .pnpm slot, the app to the packages/linkedin symlink). Calling
// mock.module from a file inside apps/api covers the app's path; the mock
// file's own registration still covers the frozen copy's path. The ai and
// storage mocks don't need this today because both contexts resolve them
// to the same virtual-store slot, but if one of them silently stops
// mocking after a lockfile change, this is the place to re-register it.
// See docs/docker-deploy/injected-workspace-packages.md.
import { linkedinModuleMock } from '@repo/testing';
import { mock } from 'bun:test';

mock.module('@repo/linkedin', () => linkedinModuleMock);
