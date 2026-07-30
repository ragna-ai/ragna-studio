#!/usr/bin/env bun
// One-time (per fresh docker volume) setup for the studio_test database.
// Usage: pnpm --filter @repo/testing test:setup, which sets NODE_ENV=test
// (a plain script run gets no NODE_ENV from Bun, unlike `bun test`) so
// @repo/config loads .env.testing before setupTestDatabase's own
// @repo/config import.
import { setupTestDatabase } from '../src/db/setup-test-db';

await setupTestDatabase();
