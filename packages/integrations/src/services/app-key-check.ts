import { checkAppKeys, InvalidAppKeyError } from '@repo/crypto';
import { logger } from '@repo/logger';

/**
 * Run before the API or worker starts. A missing APP_KEY only disables integrations; a malformed
 * one would fail every connect and token read, so it stops startup.
 */
export function checkAppKeysAtStartup(): void {
  const { appKey, invalidPreviousKeyPositions } = checkAppKeys();

  if (invalidPreviousKeyPositions.length > 0) {
    logger.error(
      `APP_PREVIOUS_KEYS entries ${invalidPreviousKeyPositions.join(', ')} are not valid keys and are ` +
        'ignored. Secrets written with them stay unreadable until the entries are fixed.',
    );
  }

  if (appKey === 'missing') {
    logger.warn(
      'APP_KEY is not set: connecting integrations is disabled. Local dev: run `pnpm key:generate`, ' +
        'which writes it to .env. Production: generate it once and set it as an environment ' +
        'variable or secret, see the self-hosting docs.',
    );
  }

  if (appKey === 'invalid') {
    throw new InvalidAppKeyError();
  }
}
