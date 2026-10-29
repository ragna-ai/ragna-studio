# E2E tests

Playwright drives the real web app against the real API, with the AI providers mocked.

## Run

One-time setup:

```bash
pnpm --filter @repo/api test:setup
pnpm --filter @repo/web exec playwright install chromium
```

Then:

```bash
pnpm test:e2e
```

Playwright starts its own API (port 3110) and a production build of the web app (port 3100). The first run builds the app and takes about a minute. It never reuses the dev servers on 3000 and 3010.

## How it works

- The API runs with the same preloads as `bun test` (`pnpm --filter @repo/api serve:e2e`), so queues, mail and AI providers are mocked.
- `e2e/auth.setup.ts` runs `apps/api/test/e2e/seed-user.ts` with Bun. It resets `studio_test`, seeds a user, a model and credits, and writes the session cookie to `e2e/.auth/` (gitignored).
- The API test suite and the e2e run share `studio_test`. They serialize through a Postgres advisory lock, so a second run waits until the first one ends.
