#!/usr/bin/env bun
// Runs `bun test` behind a machine-wide lock. Every run shares the
// studio_test database and truncates it before each test, so two
// concurrent runs (e.g. parallel agents in separate worktrees) would wipe
// each other's rows. Usage: pnpm --filter @repo/api test [bun test args]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCK_DIR = join(tmpdir(), 'ragna-studio-api-test.lock');
const PID_FILE = join(LOCK_DIR, 'pid');
const POLL_INTERVAL_MS = 500;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockHolderPid(): number | undefined {
  try {
    return Number(readFileSync(PID_FILE, 'utf8'));
  } catch {
    return undefined;
  }
}

function tryAcquireLock(): boolean {
  try {
    mkdirSync(LOCK_DIR);
    writeFileSync(PID_FILE, String(process.pid));
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(): Promise<void> {
  let announcedWait = false;

  while (!tryAcquireLock()) {
    const holderPid = readLockHolderPid();

    // Left behind by a run that crashed or was killed.
    if (holderPid !== undefined && !isProcessAlive(holderPid)) {
      rmSync(LOCK_DIR, { recursive: true, force: true });
      continue;
    }

    if (!announcedWait) {
      console.log(`Waiting for another API test run to finish (pid ${holderPid ?? 'unknown'})...`);
      announcedWait = true;
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }
}

function releaseLock(): void {
  if (readLockHolderPid() === process.pid) {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

await acquireLock();

const testRun = Bun.spawn(['bun', 'test', ...process.argv.slice(2)], { stdio: ['inherit', 'inherit', 'inherit'] });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    testRun.kill(signal);
  });
}

const exitCode = await testRun.exited;
releaseLock();
process.exit(exitCode);
