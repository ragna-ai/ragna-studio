# Worker test suite

Status: implemented (PR #103, merged 2026-10-10). Source: the "Hardening" section of [backlog](../backlog.md).

## Summary

`apps/worker` has no tests. This PRD adds a `bun test` suite to it that reuses the `apps/api`
harness ([strategy](./strategy.md), [apps/api/test/README.md](../../apps/api/test/README.md)).
It covers every processor and cron in one go, including the backlog items:

- purge cron and its job wrappers
- null-user handling in workflow runs and notifications
- schedule tick skip when the author can't run it (`workflow-schedule.processor.ts`)
- `DELETE_MEDIA_OBJECTS_JOB` (`purge.processor.ts`)
- email draft agent resolution in the worker (`email-draft.service.ts`)

## Decisions

1. **Queue stays mocked.** No real Redis, no BullMQ worker in tests. CI needs no Redis service.
   Wiring is covered by asserting that each `register…` call hands `createWorker` the right
   queue name and options, and that `registerJobProcessors()` / `registerCronJobs()` register
   every processor and cron.
2. **Exported handler per processor.** Each inline closure moves into an exported
   `process<Name>Job(job)` in the same file. `register<Name>JobProcessor()` keeps only the
   `createWorker` call and the `ready` listener. Tests call the handler with a minimal job.
   Crons already export their function and need no change.
3. **Same database, same lock.** Tests run against `studio_test`, truncate in `beforeEach`,
   run serially (`maxConcurrency = 1`), and take `acquireTestSuiteLock()` in the preload. API
   and worker runs can't overlap.
4. **Mock at the provider, keep the AI SDK real.** The provider factories `@repo/ai` calls
   (`createAnthropic`, `createOpenAI`, `createBlackForestLabs`, `createVertex`) are mocked to
   return the official V4 mock models from `ai/test` (`MockLanguageModelV4`,
   `MockEmbeddingModelV4`, `MockImageModelV4`, `MockVideoModelV4`). `generateText`,
   `generateImage`, `embedMany` and `experimental_generateVideo` all run for real, so tool loops,
   validation and usage-based credit settlement are under test. V4, not V3: since `ai@7.0.116`
   the SDK downgrades prompts for V3 models, so a V3 mock sees a different prompt than prod.
5. **Shared mocks move to `@repo/testing`.** The mail-provider mock and email fixtures in
   `apps/api/test/email/support/` are needed by both apps. They move into
   `packages/testing/src/mail/`. `apps/api` imports them from there.

## Harness

### Files

```
apps/worker/
  bunfig.toml            # [test] maxConcurrency = 1, preload = ["./test/preload.ts"]
  test/
    preload.ts           # re-registers module mocks from the worker's resolution context, takes the suite lock
    tsconfig.json        # same as apps/api/test/tsconfig.json
    README.md            # layout, mocks, how to run (short; links apps/api/test/README.md for shared mechanics)
    support/
      job.ts             # buildJob({ name, data, attempts?, attemptsMade? })
    <domain>/*.test.ts
```

`package.json`:

- `"test": "bun test"`, `"test:setup": "pnpm --filter @repo/testing test:setup"`
- `check-types` also runs `tsc --noEmit -p test`, like `apps/api`
- devDependency `@repo/testing`

### Job builder

Handlers take a BullMQ `Job`. Tests don't build a real one. `buildJob()` returns the subset the
handlers read (`id`, `name`, `data`, `opts.attempts`, `attemptsMade`), typed so a handler
accepts it without `as any`. Handler signatures take a narrow `Pick<Job, ...>` type, declared in
`@repo/queue` as a named interface, so the fake satisfies it structurally.

### Mocks

Registered in `test/preload.ts` from the worker's own resolution context, for the same
injected-package reason as `apps/api/test/preload.ts`
(`specs/docker-deploy/injected-workspace-packages.md`):

| Module                    | What is faked                                                                   |
| ------------------------- | ------------------------------------------------------------------------------- |
| `@repo/queue`             | existing `queueModuleMock`, plus `createWorker` (records name, opts, processor) |
| `@repo/storage`           | existing storage mock                                                           |
| `@ai-sdk/*` (4 providers) | `create*` returns a provider of scriptable V4 mock models                       |
| `@repo/mail/provider`     | moved mail-provider mock                                                        |
| `@repo/mail`              | `sendEmail` (the email processor's only boundary)                               |

`enqueueNotification` goes through the mocked queue, so tests assert the notification via
`queueAddMock`. The notification processor itself is tested separately against the real
`createNotification`.

Update the header comment of `queue-provider.mock.ts`. It says the worker should test against
real BullMQ. That is no longer the plan (decision 1).

### CI

The `api-tests` job also runs `pnpm --filter @repo/worker test` after the API tests, and its
`changes` filter widens to `apps/worker/**`. Build step becomes
`--filter=@repo/api... --filter=@repo/worker...`. No new required check.

## Test cases by domain

Each domain folder gets one or more test files. Cases below are the minimum. Every handler also
gets an "unknown job name throws" case.

### `test/wiring/`

- `registerJobProcessors()` registers one worker per queue constant, with the documented
  `concurrency` / `lockDuration`.
- `registerCronJobs()` registers every cron with its schedule.

### `test/purge/`

- Purge cron: an org and a user soft-deleted more than 30 days ago are purged; ones inside the
  window survive; counts in the result match.
- `PURGE_ORGANIZATION_JOB`: org rows gone, R2 keys passed to `deleteObjects`.
- `DELETE_MEDIA_OBJECTS_JOB`: `deleteObjects` receives exactly the job's keys, grouped by bucket.
- Invalid payload fails zod parsing.

### `test/crons/`

- Cleanup: expired sessions/verifications and old read notifications go; fresh ones stay. One
  failing step does not skip the others.
- Stale runs: pending > 1h and running > 2h become `failed`; terminal and fresh runs untouched.
- Task reminder: due task enqueues `task_reminder_due` and is stamped; already-sent task skipped;
  one failing enqueue does not block the rest.
- Media sweep: unreferenced media older than 24h is deleted (row + storage); referenced or fresh
  media stays.
- Email sync cron: one job per due account with `jobId = accountId`; `reauth_required` accounts
  skipped.

### `test/workflow/`

- Run processor: success enqueues `workflow_run_succeeded`; final-attempt failure marks the run
  `failed` and enqueues `workflow_run_failed`; non-final failure leaves the run `running` and
  sends nothing; an already-terminal run is not overwritten.
- Null user: a run with `triggeredByUserId = null` completes without a notification.
- Cancelled run sends no notification; cancel mid-flight stops the engine.
- Engine: a trigger → transform → agent graph runs to `completed` with the scripted model;
  condition branches skip the untaken path.
- Schedule tick: orphan (deleted, no cron, unpublished) removes the scheduler; deleted org skips
  and keeps the scheduler; active run skips; author can't run it (`resolveScheduledRunUserId`
  null) skips without a run row; happy path creates a `schedule` run and enqueues it; enqueue
  failure marks the run `failed` and rethrows.
- `reconcileSchedules()`: upserts every scheduled workflow, removes orphaned schedulers.

### `test/email/`

- Send processor: verify/welcome/invitation call `sendEmail` with the right template and
  variables. (The `verify` case documents the dead-code item in the backlog; leave the code.)
- Sync: `syncEmailAccount` upserts threads/messages from the mail-provider mock and enqueues
  classify jobs for new inbound messages.
- Classify: scripted model output sets the category; draft job enqueued only when the rules say so.
- Draft agent resolution: override agent wins; falls back to the account default; a deleted agent
  or one outside the personal workspace falls back to the personal workspace default agent; a
  user with no personal workspace gets no draft and no throw; happy path writes a draft through
  the provider mock.

### `test/generation/`

- Gen images: success notifies the author once per batch; failure marks rows `failed`, notifies,
  rethrows; a null author (deleted mid-generation) fails the row and sends no notification, since
  output storage keys are prefixed by the author.
- Gen video: same three cases.

### `test/notification/`

- `NOTIFY_USER_JOB` creates the notification row.

### `test/agent-context/`

- Extract job: text extracted, chunked, embedded, document `ready`.
- Empty text, extraction failure, embedding failure, per-document truncation and agent budget
  overflow each set the right error status.
- Chunker: pure unit tests (boundaries, overlap, empty input).

## Production code touched

- Every file in `apps/worker/src/processors/`: extract `process<Name>Job`.
- `@repo/queue`: the narrow job interface for handler signatures.
- `apps/api/test/email/support/` → `packages/testing/src/mail/`, imports updated.
- `packages/testing/src/mocks/`: new `ai-sdk-provider.mock.ts`; `queue-provider.mock.ts` gains
  `createWorker` / `addCronJob`.
- `.github/workflows/ci.yml`: worker test step.

No behavior changes. If a test exposes a bug, it goes in the backlog or gets its own fix commit,
not silently folded into a refactor.

## Build order

1. **Harness slice (first, alone).** Handler extraction, bunfig/preload/tsconfig, job builder,
   new mocks, mail mock move, CI, README, plus `test/notification/` and `test/wiring/` as proof.
2. **Domain slices (in parallel, after 1 is green):** purge + crons, workflow, email,
   generation + agent-context.
3. **Integration pass:** full worker and API suites green, `pnpm check-types`, backlog updated.

## Out of scope

- Real Redis / BullMQ end-to-end.
- The purge cron's missing per-run `LIMIT` and the `verify` template dead code (separate backlog
  items).
- Invitation email enqueue in `apps/api` (separate backlog item).
