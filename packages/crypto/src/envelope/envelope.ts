import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { UndecryptableSecretError } from '../errors';
import { getCurrentKey, getPreviousKeys } from '../keys/app-key';

/** The database CHECK on integration_connections repeats this literal. */
export const ENVELOPE_PREFIX = 'enc:v1:';
const IV_BYTES = 12;

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getCurrentKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64'));

  return `${ENVELOPE_PREFIX}${parts.join(':')}`;
}

function decryptWithKey(envelope: string, key: Buffer): string {
  const [ivPart, tagPart, ciphertextPart] = envelope.slice(ENVELOPE_PREFIX.length).split(':');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Malformed secret envelope');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Tries `APP_KEY`, then `APP_PREVIOUS_KEYS`. The GCM tag rejects a wrong key. */
export function decryptSecret(envelope: string): string {
  if (!isEncryptedSecret(envelope)) {
    throw new Error('Not a secret envelope');
  }

  for (const key of [getCurrentKey()].concat(getPreviousKeys())) {
    try {
      return decryptWithKey(envelope, key);
    } catch {
      continue;
    }
  }

  throw new UndecryptableSecretError();
}
