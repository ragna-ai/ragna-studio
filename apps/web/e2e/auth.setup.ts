import { test as setup } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { STORAGE_STATE_PATH } from '../playwright.config';

const seedResultSchema = z.object({
  cookieHeader: z.string(),
  workspaceId: z.string(),
});

const API_DIR = resolve(import.meta.dirname, '../../api');

/** Runs the Bun seed script and parses its JSON result, the last stdout line. */
function runSeed(): z.infer<typeof seedResultSchema> {
  const stdout = execFileSync('bun', ['test/e2e/seed-user.ts'], {
    cwd: API_DIR,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  const lastLine = stdout.trim().split('\n').at(-1) ?? '';
  return seedResultSchema.parse(JSON.parse(lastLine));
}

setup('seed a signed-in user', () => {
  const { cookieHeader, workspaceId } = runSeed();
  const separatorIndex = cookieHeader.indexOf('=');
  const name = cookieHeader.slice(0, separatorIndex);
  const value = cookieHeader.slice(separatorIndex + 1);

  const storageState = {
    cookies: [
      {
        name,
        value,
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
      {
        name: 'i18n_redirected',
        value: 'en',
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ],
    origins: [
      {
        origin: 'http://localhost:3100',
        localStorage: [{ name: 'workspace-scope', value: workspaceId }],
      },
    ],
  };

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState));
});
