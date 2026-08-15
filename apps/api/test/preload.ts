// apps/api/test/preload.ts (registered in bunfig.toml [test].preload)
//
// Re-registers the LinkedIn and queue mocks from apps/api's own module-
// resolution context. With injectWorkspacePackages on, @repo/testing is
// materialized as a frozen copy under node_modules/.pnpm/, and a
// mock.module call made inside that copy keys on a different resolved path
// than the one this app's code imports (the mock file resolves it to the
// injected .pnpm slot, the app to the packages/linkedin or packages/queue
// symlink). Calling mock.module from a file inside apps/api covers the
// app's path; the mock file's own registration still covers the frozen
// copy's path (which @repo/ai's build of '@repo/queue' also resolves
// through). The ai and storage mocks don't need this today because both
// contexts resolve them to the same virtual-store slot, but if one of them
// silently stops mocking after a lockfile change, this is the place to
// re-register it. See docs/docker-deploy/injected-workspace-packages.md.
import { linkedinModuleMock, queueModuleMock } from '@repo/testing';
import { mock } from 'bun:test';
import { emailQueueModuleMock } from './email/support/email-queue.mock';
import { mailProviderModuleMock } from './email/support/mail-provider.mock';

mock.module('@repo/linkedin', () => linkedinModuleMock);
mock.module('@repo/queue', () => queueModuleMock);

// email.service.ts / email-provider.service.ts are imported unconditionally
// by src/app.ts (emailController), so whichever test file happens to import
// `app` first - not necessarily one under test/email/ - is what fixes their
// `@repo/mail/provider` and `@repo/queue` bindings for the rest of the
// process (ES modules evaluate once; a mock.module call after that point
// doesn't reach an already-bound live import). Registering both here,
// before any test file loads, guarantees the email domain's mocks
// (test/email/support/) are in place no matter which file runs first. The
// queue one must be the *last* '@repo/queue' registration in this file: it
// extends queueModuleMock with the emailSync/emailClassify/emailDraft
// factories that package are missing (see email-queue.mock.ts's doc
// comment), so it has to win over the plain `queueModuleMock` registered
// two lines up.
mock.module('@repo/mail/provider', () => mailProviderModuleMock);
mock.module('@repo/queue', () => emailQueueModuleMock);
