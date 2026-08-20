import { adminClient, lastLoginMethodClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';

// better-auth's plugin-aware client type can't be bundled into a portable
// .d.ts here: naming it pulls in internal better-auth/core types that aren't
// exported from any public entry point (see
// https://github.com/better-auth/better-auth/issues/6565), which fails
// tsdown's declaration build with TS2883. The base (no-plugin) client type is
// portable, so we start from that and hand-add the lastLoginMethodClient
// methods we actually call, instead of trying to re-derive the full plugin
// type (which silently drops those methods, see git history of this file).
//
// `hydrateSession` is omitted from the base type: as of better-auth 1.7, the
// admin plugin's `banned`/`role` additional fields make its inferred
// `hydrateSession(session)` parameter a strict superset of the base client's
// (which knows nothing about those fields), and function parameters are
// contravariant, so the admin-augmented client no longer structurally
// satisfies the base signature. We never call `hydrateSession` ourselves
// (it's an internal SSR-hydration hook), so dropping it from this type is
// safe and keeps the type portable.
export type AuthClient = Omit<ReturnType<typeof createAuthClient>, 'hydrateSession'> & {
  getLastUsedLoginMethod: () => string | null;
  isLastUsedLoginMethod: (method: string) => boolean;
  clearLastUsedLoginMethod: () => void;
};
export type AuthSession = ReturnType<typeof createAppAuthClient>['$Infer']['Session'];

// Build a configured client. The caller supplies baseURL + fetchOptions so the
// same instance is used for sign-in, session reads, and sign-out. This keeps
// credentials consistent, which the OAuth state cookie round-trip depends on.
export function createAppAuthClient(options?: Parameters<typeof createAuthClient>[0]): AuthClient {
  return createAuthClient({ ...options, plugins: [adminClient(), lastLoginMethodClient()] });
}
