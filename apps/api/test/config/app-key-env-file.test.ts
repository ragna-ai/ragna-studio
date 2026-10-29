import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateAppKey, writeAppKeyToEnvFile } from '@repo/crypto';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const NEW_KEY = 'base64:bmV3LWtleS1uZXcta2V5LW5ldy1rZXktbmV3LWtleS0=';
const EXISTING_KEY = 'base64:b2xkLWtleS1vbGQta2V5LW9sZC1rZXktb2xkLWtleS0=';

describe('writing APP_KEY into an env file', () => {
  let dir: string;
  let envFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-key-'));
    envFilePath = join(dir, '.env');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('fills an empty APP_KEY line and keeps the other lines', () => {
    writeFileSync(envFilePath, 'APP_PORT=3000\nAPP_KEY=""\nLOG_LEVEL=info\n');

    const outcome = writeAppKeyToEnvFile({ envFilePath, key: NEW_KEY, force: false });

    expect(outcome).toBe('written');
    expect(readFileSync(envFilePath, 'utf8')).toBe(
      `APP_PORT=3000\nAPP_KEY="${NEW_KEY}"\nLOG_LEVEL=info\n`,
    );
  });

  test('appends APP_KEY when the file has no such line', () => {
    writeFileSync(envFilePath, 'APP_PORT=3000');

    writeAppKeyToEnvFile({ envFilePath, key: NEW_KEY, force: false });

    expect(readFileSync(envFilePath, 'utf8')).toBe(`APP_PORT=3000\nAPP_KEY="${NEW_KEY}"\n`);
  });

  test('creates the file when it does not exist', () => {
    writeAppKeyToEnvFile({ envFilePath, key: NEW_KEY, force: false });

    expect(readFileSync(envFilePath, 'utf8')).toBe(`APP_KEY="${NEW_KEY}"\n`);
  });

  test('keeps an existing key without force', () => {
    writeFileSync(envFilePath, `APP_KEY="${EXISTING_KEY}"\n`);

    const outcome = writeAppKeyToEnvFile({ envFilePath, key: NEW_KEY, force: false });

    expect(outcome).toBe('kept');
    expect(readFileSync(envFilePath, 'utf8')).toBe(`APP_KEY="${EXISTING_KEY}"\n`);
  });

  test('replaces an existing key with force', () => {
    writeFileSync(envFilePath, `APP_KEY=${EXISTING_KEY}\n`);

    const outcome = writeAppKeyToEnvFile({ envFilePath, key: NEW_KEY, force: true });

    expect(outcome).toBe('written');
    expect(readFileSync(envFilePath, 'utf8')).toBe(`APP_KEY="${NEW_KEY}"\n`);
  });

  test('ignores a commented-out APP_KEY line', () => {
    writeFileSync(envFilePath, `# APP_KEY=${EXISTING_KEY}\n`);

    const outcome = writeAppKeyToEnvFile({ envFilePath, key: NEW_KEY, force: false });

    expect(outcome).toBe('written');
    expect(readFileSync(envFilePath, 'utf8')).toBe(
      `# APP_KEY=${EXISTING_KEY}\nAPP_KEY="${NEW_KEY}"\n`,
    );
  });
});

describe('generating an APP_KEY', () => {
  test('returns base64: plus 32 random bytes', () => {
    const key = generateAppKey();

    expect(key.startsWith('base64:')).toBe(true);
    expect(Buffer.from(key.slice('base64:'.length), 'base64')).toHaveLength(32);
    expect(generateAppKey()).not.toBe(key);
  });
});
