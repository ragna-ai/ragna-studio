import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';

export type AuthClient = ReturnType<typeof createAuthClient>;
export type AuthSession = ReturnType<typeof createAppAuthClient>['$Infer']['Session'];

// Build a configured client. The caller supplies baseURL + fetchOptions so the
// same instance is used for sign-in, session reads, and sign-out. This keeps
// credentials consistent, which the OAuth state cookie round-trip depends on.
export function createAppAuthClient(options?: Parameters<typeof createAuthClient>[0]): AuthClient {
  return createAuthClient({ ...options, plugins: [adminClient()] });
}
