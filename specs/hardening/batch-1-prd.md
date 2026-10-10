# Hardening batch 1

Status: implemented (PR #105, 2026-10-10). Source: the "Hardening" section of [backlog](../backlog.md).

## Summary

Five small follow-ups from organizations v2/v3 and the worker test suite (PR #103), shipped as
one PR. No new features, no migrations.

## Items

### 1. Gen video: check the author before the render

**Today:** `requireAuthorId` (`packages/ai/src/services/videogen.service.ts`) runs only when the
output is stored (`uploadGeneratedVideo`, `persistDraftCache`), after the provider call. A row
whose author was deleted before the job ran still renders, gets paid for, then fails. Images
already check before the call (`imagen.service.ts`).

**Change:** call `requireAuthorId(record)` first thing in `generateAndUploadVideo`, before any
download or provider call. It sits inside `runGenVideo`'s `tryCatch`, so the row is marked
`failed` and the error rethrows as today. The later calls stay: an author deleted mid-render is
still caught at storage time.

**Test (worker, `test/generation/gen-video-processor.test.ts`):** the null-author case also
asserts `videoModelGenerateMock` was not called.

### 2. Purge cron: per-run limit

**Today:** `listOrganizationIdsDeletedBefore` and `listUserIdsDeletedBefore`
(`packages/database/src/repositories/organization.repo.ts`) return every expired row. A backlog
of deletions runs in one cron tick with no bound.

**Change:** both take a required `limit`. `purgeExpiredDeletions`
(`packages/media/src/services/purge.service.ts`) passes `PURGE_BATCH_SIZE = 50` to each, so a
daily run purges at most 50 organizations and 50 users. The rest follow on later days, oldest
first (`orderBy deletedAt` stays).

**Known limit:** a failed item stays at the front of the queue. Fifty items that fail every day
would block the rest. Failures are already logged and counted per run; that is acceptable at
today's volume. Revisit with a retry counter if it ever happens.

**Tests (worker, `test/purge/purge-cron.test.ts`):** with the batch size lowered via a
`purgeExpiredDeletions({ now, batchSize })` parameter (default `PURGE_BATCH_SIZE`), only the
oldest `batchSize` items purge and the rest survive.

### 3. Remove the dead `verify` email job

**Today:** `VERIFY_EMAIL_JOB` sends `templateId: 'verify'`, which `@repo/mail` never registered.
Nothing enqueues the job.

**Change:** delete the `VERIFY_EMAIL_JOB` case in `apps/worker/src/processors/email.processor.ts`,
and `verifyEmailJobSchema`, `VerifyEmailJobData`, `VERIFY_EMAIL_JOB` in
`packages/queue/src/dtos/email-job.dto.ts`. Drop the matching worker test case. An old job still
sitting in Redis would now hit "Unknown email job" and fail, which is the correct outcome.

### 4. Test the welcome and invitation email enqueues

**Today:** `config.isTest` skips both enqueues (`packages/auth/src/server/auth.ts`, the
user-create hook; `packages/auth/src/server/organization-invitations.ts`,
`enqueueInvitationEmail`). The skip predates the queue mock. The mock already intercepts
`@repo/auth`'s enqueues (`apps/api/test/organization/admin-remove-user.test.ts` asserts its purge
jobs).

**Change:** remove both `config.isTest` early returns. `testUtils()` stays gated on `isTest`.

**Tests (api, `test/organization/`):** creating an invitation enqueues `INVITATION_EMAIL_JOB` with
the invitee email, inviter name, organization name and an `/auth/login?invitation=<id>` URL; a
rejected invitation enqueues nothing; seeding a user enqueues `WELCOME_EMAIL_JOB`; an enqueue
failure is logged and does not fail the request.

**Fallout:** tests that assert `queueAddMock` was not called at all would now see the welcome
email from seeding. Those assertions filter by job name instead. No test may call
`resetProviderMocks()` between seeding and acting just to hide it.

### 5. API image tests on the provider-level AI mock

**Today:** `apps/api/test/imagegen/gen-images.test.ts` asserts `generateImageMock` (a fake of the
`ai` package's `generateImage`) was not called. The worker suite has to undo that fake with
`passGenerateImageThrough()`.

**Change:** those assertions use `imageModelGenerateMock` (`ai-sdk-provider.mock.ts`) instead.
Then delete `packages/testing/src/mocks/ai-provider.mock.ts` entirely (`generateImageMock`,
`passGenerateImageThrough`, `resetAiProviderMock`, the `ai` module mock), its use in
`provider-mocks.ts` and `apps/worker/test/preload.ts`, and the mentions in
`apps/api/test/README.md`, `apps/worker/test/README.md` and `specs/testing/worker-prd.md`.

## Build

Two Sonnet agents in parallel, disjoint files:

- **A (items 1-3):** `packages/ai`, `packages/database`, `packages/media`, `packages/queue`,
  `apps/worker`.
- **B (items 4-5):** `packages/auth`, `packages/testing`, `apps/api/test`,
  `apps/worker/test/preload.ts`, the two test READMEs.

Both rebuild the packages they touch, run both suites, `pnpm check-types` and `pnpm format`. The
lead runs the full suites once after both finish and removes the shipped items from the backlog.

## Out of scope

- A retry counter or dead-letter state for purge items that keep failing.
- Other backlog items (N+1 leftovers, migration CI step, nested `await` cleanup).
