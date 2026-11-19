import { hkdfSync, randomBytes } from 'node:crypto';
import { config } from '@repo/config';
import { AppKeyMissingError, InvalidAppKeyError } from '../errors';

const KEY_PREFIX = 'base64:';
const KEY_BYTES = 32;
// A new use of APP_KEY derives its own key with a new label, never the raw APP_KEY.
const SECRETS_AT_REST_LABEL = 'ragna/secrets-at-rest/v1';
const TOOL_APPROVAL_LABEL = 'ragna/tool-approval/v1';

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const encoded = trimmed.startsWith(KEY_PREFIX) ? trimmed.slice(KEY_PREFIX.length) : '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new InvalidAppKeyError();
  }
  return key;
}

function isWellFormedKey(raw: string): boolean {
  try {
    parseKey(raw);
    return true;
  } catch {
    return false;
  }
}

function listPreviousKeys(): string[] {
  return config
    .getSecret('APP_PREVIOUS_KEYS')
    .split(',')
    .filter((raw) => raw.trim().length > 0);
}

function deriveKey(appKey: Buffer, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', appKey, Buffer.alloc(0), label, KEY_BYTES));
}

function deriveSecretsAtRestKey(appKey: Buffer): Buffer {
  return deriveKey(appKey, SECRETS_AT_REST_LABEL);
}

/** A new random key in the format APP_KEY expects. */
export function generateAppKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString('base64')}`;
}

export function isAppKeyConfigured(): boolean {
  return config.getSecret('APP_KEY').length > 0;
}

export type AppKeyStatus = 'missing' | 'valid' | 'invalid';

export interface AppKeyCheck {
  appKey: AppKeyStatus;
  /** 1-based positions of the APP_PREVIOUS_KEYS entries that are not a valid key. */
  invalidPreviousKeyPositions: number[];
}

function getAppKeyStatus(raw: string): AppKeyStatus {
  if (!raw) return 'missing';
  return isWellFormedKey(raw) ? 'valid' : 'invalid';
}

/** Checks the configured keys without throwing, so startup can report every problem at once. */
export function checkAppKeys(): AppKeyCheck {
  const appKey = getAppKeyStatus(config.getSecret('APP_KEY'));
  const invalidPreviousKeyPositions = listPreviousKeys().flatMap((previous, index) =>
    isWellFormedKey(previous) ? [] : [index + 1],
  );
  return { appKey, invalidPreviousKeyPositions };
}

/** The key new secrets are written with. */
export function getCurrentKey(): Buffer {
  const raw = config.getSecret('APP_KEY');
  if (!raw) {
    throw new AppKeyMissingError();
  }
  return deriveSecretsAtRestKey(parseKey(raw));
}

/**
 * Keys that only read secrets written before a rotation. A malformed entry is skipped, so it
 * can't block secrets the other keys can read; startup reports it.
 */
export function getPreviousKeys(): Buffer[] {
  return listPreviousKeys()
    .filter(isWellFormedKey)
    .map((raw) => deriveSecretsAtRestKey(parseKey(raw)));
}

/** Signs the tool approvals the server issues, so a client cannot forge one. */
export function getToolApprovalSecret(): Buffer {
  const raw = config.getSecret('APP_KEY');
  if (!raw) {
    throw new AppKeyMissingError();
  }
  return deriveKey(parseKey(raw), TOOL_APPROVAL_LABEL);
}
