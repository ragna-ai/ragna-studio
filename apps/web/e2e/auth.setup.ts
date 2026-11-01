import { test as setup } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import {
  MEMBER_STORAGE_STATE_PATH,
  STORAGE_STATE_PATH,
} from '../playwright.config';

const seedResultSchema = z.object({
  cookieHeader: z.string(),
  workspaceId: z.string(),
  memberCookieHeader: z.string(),
  memberWorkspaceId: z.string(),
});

const API_DIR = resolve(import.meta.dirname, '../../api');

/** Runs the Bun seed script and parses its JSON stdout. */
function runSeed(): z.infer<typeof seedResultSchema> {
  const stdout = execFileSync('bun', ['test/e2e/seed-user.ts'], {
    cwd: API_DIR,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  return seedResultSchema.parse(JSON.parse(stdout));
}

/** Writes a Playwright storage state holding the session cookie and the active workspace. */
function writeStorageState(
  path: string,
  cookieHeader: string,
  workspaceId: string,
): void {
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

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(storageState));
}

setup('seed signed-in users', () => {
  const seed = runSeed();
  writeStorageState(STORAGE_STATE_PATH, seed.cookieHeader, seed.workspaceId);
  writeStorageState(
    MEMBER_STORAGE_STATE_PATH,
    seed.memberCookieHeader,
    seed.memberWorkspaceId,
  );
});
