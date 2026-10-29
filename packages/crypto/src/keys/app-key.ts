import { hkdfSync, randomBytes } from 'node:crypto';
import { config } from '@repo/config';
import { AppKeyMissingError, InvalidAppKeyError } from '../errors';

const KEY_PREFIX = 'base64:';
const KEY_BYTES = 32;
// A new use of APP_KEY derives its own key with a new label, never the raw APP_KEY.
const SECRETS_AT_REST_LABEL = 'ragna/secrets-at-rest/v1';

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const encoded = trimmed.startsWith(KEY_PREFIX) ? trimmed.slice(KEY_PREFIX.length) : '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new InvalidAppKeyError();
  }
  return key;
}

function deriveSecretsAtRestKey(appKey: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', appKey, Buffer.alloc(0), SECRETS_AT_REST_LABEL, KEY_BYTES));
}

/** A new random key in the format APP_KEY expects. */
export function generateAppKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString('base64')}`;
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
  return deriveSecretsAtRestKey(parseKey(raw));
}

/** Keys that only read secrets written before a rotation. */
export function getPreviousKeys(): Buffer[] {
  return config
    .getSecret('APP_PREVIOUS_KEYS')
    .split(',')
    .filter((raw) => raw.trim().length > 0)
    .map((raw) => deriveSecretsAtRestKey(parseKey(raw)));
}
