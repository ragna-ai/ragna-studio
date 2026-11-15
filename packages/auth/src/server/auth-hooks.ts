import { createAuthMiddleware } from 'better-auth/api';
import { rejectInvitingRemovedMember } from './organization-invitations';
import {
  enqueuePasskeyAddedEmail,
  keepPasskeyNameOutOfUsername,
  requirePasskeyName,
} from './passkeys';

export type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** A before hook may override query keys the route then sees (merged, never removed). */
export interface AuthHookResult {
  context: { query: Record<string, unknown> };
}

type AuthHook = (ctx: AuthHookContext) => Promise<AuthHookResult | void>;

// better-auth accepts one before and one after middleware, so each phase dispatches by path.
const beforeHooks: Record<string, AuthHook> = {
  '/organization/invite-member': rejectInvitingRemovedMember,
  '/passkey/generate-register-options': keepPasskeyNameOutOfUsername,
  '/passkey/verify-registration': requirePasskeyName,
  '/passkey/update-passkey': requirePasskeyName,
};

const afterHooks: Record<string, AuthHook> = {
  '/passkey/verify-registration': enqueuePasskeyAddedEmail,
};

export const beforeAuthHook = createAuthMiddleware(async (ctx) => {
  return beforeHooks[ctx.path]?.(ctx);
});

export const afterAuthHook = createAuthMiddleware(async (ctx) => {
  await afterHooks[ctx.path]?.(ctx);
});
