import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { PASSKEY_ADDED_EMAIL_JOB, passkeyAddedEmailJobSchema, queue } from '@repo/queue';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import * as z from 'zod';
import { passkeyNameSchema } from '../client/passkeys';
import type { AuthHookContext } from './auth-hooks';

const passkeyNameBodySchema = z.object({ name: passkeyNameSchema });

const createdPasskeySchema = z.object({ name: passkeyNameSchema.nullish() });

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
        settingsUrl: `${config.appUrl}/settings/sign-in/passkeys`,
      }),
    );
  } catch (error) {
    logger.error('Failed to enqueue passkey added email', { userId: session.user.id, error });
  }
}
