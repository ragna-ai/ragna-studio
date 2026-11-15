import { ConfigService } from '@repo/config';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

const APP_URL_ENV_KEYS = ['APP_URL', 'APP_PORT'] as const;

describe('ConfigService app URL', () => {
  const originalEnv = new Map<string, string | undefined>();

  function setEnv(values: Partial<Record<(typeof APP_URL_ENV_KEYS)[number], string>>) {
    for (const key of APP_URL_ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  beforeEach(() => {
    for (const key of APP_URL_ENV_KEYS) originalEnv.set(key, process.env[key]);
  });

  afterEach(() => {
    for (const key of APP_URL_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('derives origin and hostname from APP_URL', () => {
    setEnv({ APP_URL: 'https://app.example.com' });

    const config = new ConfigService();

    expect(config.appUrl).toBe('https://app.example.com');
    expect(config.appOrigin).toBe('https://app.example.com');
    expect(config.appHostname).toBe('app.example.com');
  });

  test('drops a trailing slash so paths can be appended', () => {
    setEnv({ APP_URL: 'https://app.example.com/' });

    expect(new ConfigService().appUrl).toBe('https://app.example.com');
  });

  test('keeps the port in the origin', () => {
    setEnv({ APP_URL: 'http://localhost:3100' });

    const config = new ConfigService();

    expect(config.appOrigin).toBe('http://localhost:3100');
    expect(config.appHostname).toBe('localhost');
  });

  test('defaults to localhost on APP_PORT when APP_URL is empty', () => {
    setEnv({ APP_URL: '', APP_PORT: '3200' });

    const config = new ConfigService();

    expect(config.appUrl).toBe('http://localhost:3200');
    expect(config.appOrigin).toBe('http://localhost:3200');
  });

  test('rejects an APP_URL that is not a URL', () => {
    setEnv({ APP_URL: 'app.example.com' });
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});

    expect(() => new ConfigService()).toThrow('Environment validation failed');
    expect(JSON.stringify(consoleError.mock.calls)).toContain('APP_URL');

    consoleError.mockRestore();
  });
});
