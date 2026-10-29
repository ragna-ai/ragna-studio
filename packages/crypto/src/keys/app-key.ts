import { config } from '@repo/config';
import { AppKeyMissingError, InvalidAppKeyError } from '../errors';

const KEY_PREFIX = 'base64:';
const KEY_BYTES = 32;

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const encoded = trimmed.startsWith(KEY_PREFIX) ? trimmed.slice(KEY_PREFIX.length) : '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new InvalidAppKeyError();
  }
  return key;
}

export function isAppKeyConfigured(): boolean {
  return config.getSecret('APP_KEY').length > 0;
}

/** The key new secrets are written with. */
export function getCurrentKey(): Buffer {
  const raw = config.getSecret('APP_KEY');
  if (!raw) {
    throw new AppKeyMissingError();
  }
  return parseKey(raw);
}

/** Keys that only read secrets written before a rotation. */
export function getPreviousKeys(): Buffer[] {
  return config
    .getSecret('APP_PREVIOUS_KEYS')
    .split(',')
    .filter((raw) => raw.trim().length > 0)
    .map(parseKey);
}
