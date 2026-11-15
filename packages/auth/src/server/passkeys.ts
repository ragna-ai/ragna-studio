import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { PASSKEY_ADDED_EMAIL_JOB, passkeyAddedEmailJobSchema, queue } from '@repo/queue';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import * as z from 'zod';
import { passkeyNameSchema } from '../client/passkeys';
import { readStoredLocale } from './user-locale';
import type { AuthHookContext, AuthHookResult } from './auth-hooks';

const passkeyNameBodySchema = z.object({ name: passkeyNameSchema });

const createdPasskeySchema = z.object({ name: passkeyNameSchema.nullish() });

/**
 * The plugin turns a requested passkey name into the WebAuthn username, so password managers would
 * list the account under the device label. An empty name makes it fall back to the email. Hook
 * results are merged into the request, so the key is blanked, not removed. The name still reaches
 * verify-registration and is stored as the label.
 */
export async function keepPasskeyNameOutOfUsername(): Promise<AuthHookResult> {
  return { context: { query: { name: '' } } };
}

/** Every passkey needs a name, on add and on rename. */
export async function requirePasskeyName(ctx: AuthHookContext): Promise<void> {
  const body = passkeyNameBodySchema.safeParse(ctx.body);
  if (body.success) return;
  throw new APIError('BAD_REQUEST', {
    message: 'A passkey name of 1 to 64 characters is required.',
  });
}

/** Tells the user a passkey was added, so an unexpected one gets noticed. Never fails the request. */
export async function enqueuePasskeyAddedEmail(ctx: AuthHookContext): Promise<void> {
  const created = createdPasskeySchema.safeParse(ctx.context.returned);
  const session = await getSessionFromCtx(ctx);
  if (!created.success || !session) {
    logger.warn('Passkey added email skipped: no readable passkey or session', {
      userId: session?.user.id,
      hasPasskey: created.success,
    });
    return;
  }

  try {
    await queue.email().add(
      PASSKEY_ADDED_EMAIL_JOB,
      passkeyAddedEmailJobSchema.parse({
        email: session.user.email,
        userName: session.user.name,
        passkeyName: created.data.name ?? 'Passkey',
        locale: readStoredLocale(session.user.locale),
        settingsUrl: `${config.appUrl}/settings/sign-in/passkeys`,
      }),
    );
  } catch (error) {
    logger.error('Failed to enqueue passkey added email', { userId: session.user.id, error });
  }
}
