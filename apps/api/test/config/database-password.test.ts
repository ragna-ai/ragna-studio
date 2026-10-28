import { ConfigService } from '@repo/config';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const DATABASE_ENV_KEYS = ['NODE_ENV', 'DATABASE_URL', 'DB_PASSWORD'] as const;

describe('ConfigService database password', () => {
  const originalEnv = new Map<string, string | undefined>();

  function setEnv(values: Partial<Record<(typeof DATABASE_ENV_KEYS)[number], string>>) {
    for (const key of DATABASE_ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  beforeEach(() => {
    for (const key of DATABASE_ENV_KEYS) originalEnv.set(key, process.env[key]);
  });

  afterEach(() => {
    for (const key of DATABASE_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('production without DB vars still constructs, for apps without a database', () => {
    setEnv({ NODE_ENV: 'production' });

    expect(() => new ConfigService()).not.toThrow();
  });

  test('development without DB_PASSWORD composes a URL with an empty password', () => {
    setEnv({ NODE_ENV: 'development' });

    const databaseUrl = new URL(new ConfigService().getSecret('DATABASE_URL'));

    expect(databaseUrl.password).toBe('');
  });

  test('DB_PASSWORD is used in the composed URL', () => {
    setEnv({ NODE_ENV: 'development', DB_PASSWORD: 's3cret' });

    expect(new URL(new ConfigService().getSecret('DATABASE_URL')).password).toBe('s3cret');
  });

  test('toSafeObject redacts DB_PASSWORD', () => {
    setEnv({ NODE_ENV: 'development', DB_PASSWORD: 's3cret' });

    expect(new ConfigService().toSafeObject().DB_PASSWORD).toBe('***REDACTED***');
  });
});
