import { auth } from '@repo/auth/server';
import { getAllWorkspacesByOwnerId } from '@repo/database';
import type { TestHelpers } from 'better-auth/plugins';

export interface SeededAuthenticatedUser {
  userId: string;
  workspaceId: string;
  /** Ready to use as the `Cookie` header on an `app.request()` call. */
  cookieHeader: string;
}

interface AuthContextWithTestHelpers {
  test?: TestHelpers;
}

/**
 * `auth` is exported `as unknown as ReturnType<typeof betterAuth>`
 * (packages/auth/src/server/auth.ts) to sidestep a better-auth type
 * inference issue, which also erases the plugin-specific `ctx.test` type
 * even though testUtils() is registered whenever config.isTest is true.
 * Reconstituting just that slice, typed against better-auth's own
 * TestHelpers, keeps this test-only and avoids an `any`. Shared by every
 * helper in this file that needs `ctx.test`.
 */
async function getTestHelpers(): Promise<TestHelpers> {
  const context = await auth.$context;
  const { test } = context as unknown as AuthContextWithTestHelpers;

  if (!test) {
    throw new Error(
      'auth.$context.test is undefined: the testUtils plugin only registers when config.isTest ' +
        'is true, so NODE_ENV must be "test" before @repo/auth loads (see the consuming app\'s ' +
        'test preload script, e.g. apps/api/test/support/preload.ts).',
    );
  }

  return test;
}

/**
 * Seeds everything an authenticated, workspace-scoped request needs: a
 * user, a session, and that user's personal workspace.
 *
 * better-auth here has no email/password provider (social sign-in only), so
 * tests can't sign up through the API. Instead this uses better-auth's own
 * `testUtils` plugin (`packages/auth/src/server/auth.ts`, gated on
 * `config.isTest`), which exposes `ctx.test` for creating rows and sessions
 * directly. This is the same `auth` instance and context the real
 * `authMiddleware` verifies against, so the cookie it mints just works.
 *
 * `ctx.test.saveUser()` writes through better-auth's internal adapter,
 * which runs the production `databaseHooks.user.create.after` hook (see
 * node_modules/better-auth/dist/db/with-hooks.mjs: `createWithHooks` always
 * runs `create.after`, immediately when called outside a transaction, which
 * is the case here). That hook already creates the personal workspace and
 * queues the welcome email, so this helper fetches the workspace the hook
 * created rather than creating a second one.
 */
export async function seedAuthenticatedUser(): Promise<SeededAuthenticatedUser> {
  const test = await getTestHelpers();

  const draftUser = test.createUser({ email: `test-${crypto.randomUUID()}@example.com` });
  const seededUser = await test.saveUser(draftUser);

  const [workspace] = await getAllWorkspacesByOwnerId({ ownerId: seededUser.id });

  if (!workspace) {
    throw new Error(
      'Expected the user-create databaseHook to have created a personal workspace, but none was found.',
    );
  }

  const authHeaders = await test.getAuthHeaders({ userId: seededUser.id });
  const cookieHeader = authHeaders.get('cookie');

  if (!cookieHeader) {
    throw new Error('better-auth did not return a session cookie');
  }

  return {
    userId: seededUser.id,
    workspaceId: workspace.id,
    cookieHeader,
  };
}

/**
 * Deletes a seeded user, cascading to their sessions (`onDelete: 'cascade'`
 * on `sessions.user_id`, packages/database/src/schema/session.schema.ts).
 * For tests that need a cookie which was valid when minted but no longer
 * resolves to anything, e.g. simulating account deletion out from under an
 * open session.
 */
export async function deleteSeededUser({ userId }: { userId: string }): Promise<void> {
  const test = await getTestHelpers();
  await test.deleteUser(userId);
}
