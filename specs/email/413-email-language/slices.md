# Transactional emails in the user's language (slices)

> **Status: proposed** (2026-11-15). Issue #413. [prd.md](./prd.md), [design.md](./design.md).

Every slice follows AGENTS.md and loads the clean-code skill, plus tdd for `apps/api`.

**Order.** The lead writes `@repo/utils` `src/locale.ts` (the shared contract) before dispatch. S1,
S2 and S4 then run in parallel. S3 runs after S1 and S2.

**Prerequisite.** The passkey added email comes from PR #402. The build starts after #402 is merged
and this branch is rebased on `origin/main`.

**Test database.** S2 adds a column. The shared `studio_test` database needs the new schema before
API tests run. Only the developer runs `test:setup`.

## S1 `@repo/mail`: shared layout and translations

- **Owns:** `packages/mail/src/**`, `packages/mail/test/**`.
- **Delivers:** US-3.5, the rendering half of US-3.1 to US-3.4.
- **Contract out:** `sendEmail(SendEmailInput)`, `TransactionalEmail` (design.md).
- **Tests:** `packages/mail/test/`, each email rendered in `en` and `de` from an installed-path copy
  of the templates (as `render-email.test.ts` does today).

## S2 Backend: column, sign-up, enqueue, profile

- **Owns:** `packages/database/src/schema/user.schema.ts`, `packages/database/src/zod/index.ts`, the
  generated migration, `packages/auth/src/server/**`, `packages/queue/src/dtos/email-job.dto.ts`,
  `apps/api/src/controllers/user.controller.ts`, `apps/api/test/{user,auth,organization}/**`.
- **Delivers:** US-1.1, US-1.2, US-2.1 to US-2.4, the enqueue half of US-3.1 to US-3.3.
- **Contract out:** job DTOs with `locale`, profile and session with `locale`.

## S3 Worker

- **Owns:** `apps/worker/src/processors/email.processor.ts`, `apps/worker/test/email/**`,
  `packages/testing/src/mocks/mail-sender.mock.ts` if its type needs it.
- **Delivers:** US-3.1 to US-3.4 at worker level.

## S4 Web and docs

- **Owns:** `apps/web/app/pages/auth/login.vue`,
  `apps/web/app/features/user/components/UserLanguageSettings.vue`, a new locale sync composable,
  `apps/web/i18n/locales/*.json`, the web auth client setup, `apps/web/e2e/**`,
  `apps/docs/.../getting-started/dashboard-and-navigation.mdx`.
- **Delivers:** US-1.3, US-1.4, the web half of US-1.1 and US-2.1.
