import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import config from '@repo/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const password = config.getSecret('ENCRYPTION_PASSWORD');
  if (!password) {
    throw new Error('ENCRYPTION_PASSWORD not set');
  }

  // NOTE: Using SHA-256 for backward compatibility.
  // For new implementations, consider using scrypt or HKDF for better key derivation.
  cachedKey = createHash('sha256').update(password).digest();
  return cachedKey;
}

export function encryptData(data: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptData(data: string): string {
  const buf = Buffer.from(data, 'base64');

  // IV (16) + Tag (16) = 32 bytes minimum
  if (buf.length < 32) {
    throw new Error('Invalid encrypted data: data too short');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
