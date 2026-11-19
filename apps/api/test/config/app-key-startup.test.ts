import { config } from '@repo/config';
import { generateAppKey, InvalidAppKeyError } from '@repo/crypto';
import { checkAppKeysAtStartup } from '@repo/integrations';
import { logger } from '@repo/logger';
import { afterEach, describe, expect, spyOn, test, type Mock } from 'bun:test';

const MALFORMED_KEY = 'base64:dG9vLXNob3J0';

interface ConfiguredKeys {
  current: string;
  previous: string;
}

function configureKeys({ current, previous }: ConfiguredKeys): Mock<typeof config.getSecret> {
  return spyOn(config, 'getSecret').mockImplementation((key: string) => {
    if (key === 'APP_KEY') return current;
    if (key === 'APP_PREVIOUS_KEYS') return previous;
    throw new Error(`The test did not expect a read of ${key}`);
  });
}

interface RecordedCalls {
  mock: { calls: readonly unknown[][] };
}

function loggedText(spy: RecordedCalls): string {
  return spy.mock.calls.flat().map(String).join('\n');
}

describe('checking APP_KEY and APP_PREVIOUS_KEYS at startup', () => {
  const configuredKeys: Mock<typeof config.getSecret>[] = [];
  const errorLog = spyOn(logger, 'error');
  const warnLog = spyOn(logger, 'warn');

  function useKeys(keys: ConfiguredKeys): void {
    configuredKeys.push(configureKeys(keys));
  }

  afterEach(() => {
    for (const spy of configuredKeys.splice(0)) spy.mockRestore();
    errorLog.mockClear();
    warnLog.mockClear();
  });

  test('passes silently with a valid key and valid previous keys', () => {
    useKeys({ current: generateAppKey(), previous: `${generateAppKey()},${generateAppKey()}` });

    checkAppKeysAtStartup();

    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
  });

  test('warns but starts when APP_KEY is not set', () => {
    useKeys({ current: '', previous: '' });

    checkAppKeysAtStartup();

    expect(loggedText(warnLog)).toContain('APP_KEY is not set');
  });

  test('refuses to start when APP_KEY is malformed', () => {
    useKeys({ current: MALFORMED_KEY, previous: '' });

    expect(() => checkAppKeysAtStartup()).toThrow(InvalidAppKeyError);
  });

  test('names the position of a malformed previous key and still starts', () => {
    useKeys({ current: generateAppKey(), previous: `${generateAppKey()},${MALFORMED_KEY}` });

    checkAppKeysAtStartup();

    const logged = loggedText(errorLog);
    expect(logged).toContain('APP_PREVIOUS_KEYS');
    expect(logged).toContain('2');
    expect(logged).not.toContain(MALFORMED_KEY);
  });
});
