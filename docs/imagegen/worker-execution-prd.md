# Imagegen worker execution (PRD)

> **Status: implemented** (2026-08-06, approved). Supersedes the
> rejected v1 of this document (sync facade over an awaited queue). Builds
> on `docs/imagegen/prd.md` (the feature itself, unchanged) and copies the
> execution model videogen already ships (`docs/videogen/prd.md` decision 2,
> `docs/videogen/prd-v2.md`).

Image generation currently executes inside the API process: the provider
call, response buffering, the sharp watermark composite, and the R2 upload
all happen while the HTTP request is held open. The principle to enforce:
**the API process does no media processing**. The worker exists for exactly
this, and videogen already runs there.

## Why v1 was rejected

V1 kept the synchronous HTTP contract by enqueueing a job and blocking on
its result via `QueueEvents` and `job.waitUntilFinished`. Review showed
that this introduced a novel queue pattern (the repo's first awaited queue)
carrying its own failure modes: listener leaks on timeout, orphaned paid
jobs that run after their caller gave up, a `removeOnComplete` race in
BullMQ's finished-check, and a job payload that had to re-widen typed
unions to strings for the Redis round trip. Videogen's model has none of
these, because it never awaits a job: the pending DB row is both the typed
payload carrier and the result channel. So imagegen adopts that model
wholesale instead. One deliberate deviation is called out in decision 6.

## The core idea: pending rows, exactly like videogen

The API inserts `pending` `gen_images` rows up front and enqueues a
fire-and-forget job carrying only the row ids. The worker generates,
watermarks (best-effort), uploads, fills the rows in, and notifies. The
grid shows pending tiles and polls while any row is unfinished, the same
way the videogen grid does. Nothing anywhere awaits a queue job.

## Goals

- `POST /workspace/:workspaceId/gen-image` returns the pending rows
  immediately; the API process never touches sharp, image buffers, or R2
  for generation.
- Chat tool keeps returning finished images inline (decision 6).
- Workflow executors (already inside the worker) run generation directly;
  no queue hop.
- Behavior, wiring, and failure handling mirror videogen's; any deviation
  must be argued in this document.
- Videogen untouched.

## Non-goals

- Keeping the v1 synchronous HTTP contract. The response shape changes to
  pending rows; no backward compatibility is owed.
- Removing sharp from the API's installed `node_modules` (unchanged from
  v1: it stays a transitive dep via `@repo/media`, it just stops being
  executed there).
- BullMQ retries for generation jobs (unchanged repo-wide stance: a paid
  render failure surfaces, it does not silently rerun).

## Design decisions

1. **Schema mirrors `gen_videos`.** `gen_images` gains
   `status: 'pending' | 'processing' | 'completed' | 'failed'` (default
   `pending`), a nullable `error` text column, and `mediaId` becomes
   nullable (null until the worker uploads the output and mints the media
   row), exactly like `genvideo.schema.ts`. Plain schema push, no SQL
   migration.
2. **A batch is n rows, one job.** One request creates up to 4 outputs but
   videogen's unit is one row per render, so the request inserts n pending
   rows up front (prompt, settings, provider/model, watermark request flag,
   and the shared `gen_image_reference` rows all known at request time).
   The job payload is the row id list. The provider call is all-or-nothing,
   so a generation failure marks every row in the batch `failed` with the
   same message; the watermark stays best-effort per image, and each row's
   `visibleWatermark` is overwritten with that image's actual outcome, as
   today.
3. **The service splits like videogen's.** `createGenImages` splits into a
   request side (`createGenImageRecords` insert + enqueue, mirroring
   `createGenVideoRecord` + `requestGenVideo`) and a run side
   (`runGenImages({ genImageIds })`, mirroring `runGenVideo`) that reads
   everything typed from the rows: settings from `gen_images`, reference
   storage keys via `gen_image_reference` → `media`. The DTO through Redis
   is `{ genImageIds: string[] }`; no widened unions, nothing to cast back.
4. **Fire-and-forget enqueue, videogen's failure handling.** Enqueue
   failure marks the batch rows `failed` with an enqueue error message,
   mirroring `enqueueGenVideoJob`. No await timeout exists, so v1's 503
   mapping and `enqueueAndAwait` helper are not built; the capability
   check, Zod validation, and the "Provider " 400 convention stay API-side
   before any row is inserted.
5. **Worker settings.** `gen-images.processor` with concurrency 2, no
   retries, 5-minute lock (well above a batch's real ceiling, same
   lock-beyond-job-ceiling pattern as `gen-video.processor.ts`). On
   completion or failure it sends a best-effort notification, new kinds
   `image_generation_succeeded` / `image_generation_failed`, one per batch
   (data: row ids, workspaceId, prompt), mirroring the videogen
   processor's `notifyBestEffort`. If a success notification for a
   seconds-long render proves noisy, dropping it is a one-line trim; parity
   first.
6. **Chat tool: enqueue, then poll the rows (the one deviation).** Exact
   videogen behavior would return "generation started" and drop inline
   images from the agent's reply. That trade is forced for minute-long
   video renders; for seconds-long images it is not, and inline images are
   the tool's point. So the chat-path tool enqueues like everything else,
   then polls the `gen_images` rows by status (short interval, ~60s cap).
   Rows `completed` in time come back inline exactly as today; on the cap
   it degrades to videogen behavior, returning the pending ids so the user
   finds the images in the library. No QueueEvents, no awaited job: the
   poll reads the same rows the grid polls. Workflow executors
   (`runsInWorker: true`) keep calling the run side directly, like the
   video tool's awaited path.
7. **Web copies the videogen grid mechanics.** `ImageGenGrid` gains
   pending/failed tiles; the form's mutation prepends the returned pending
   rows into the cached list pages and a conditional `refetchInterval`
   polls while any row on the page is `pending`/`processing`, exactly
   `useVideoGenApi.ts`'s pattern. `GenImageDto` gains `status`/`error`,
   and its URLs become nullable until completion. New i18n strings for
   tile states and notifications.

## Components

- `@repo/database`: `gen_images` status/error/nullable-mediaId schema
  change (register nothing new; table already in `relations.ts`).
- `@repo/queue`: `GEN_IMAGES_QUEUE`, id-list `GenImagesJobDto`, the two
  notification kinds. No await helper.
- `@repo/ai`: service split per decision 3; chat tool polling per
  decision 6; `runsInWorker` flag as already wired.
- `apps/worker`: `gen-images.processor.ts` running `runGenImages` +
  best-effort notify, registered in `processors/index.ts`.
- `apps/api`: `generateImagesForWorkspace` inserts rows + enqueues,
  returns pending DTOs.
- `apps/web`: grid/form/notification changes per decision 7.

## Sequence

```
web form (API process)
  └─ validate → insert n pending gen_images rows (+ references) → enqueue ids → 200 pending DTOs
worker: gen-images.processor
  └─ runGenImages: read rows → provider call → best-effort watermark → upload
     → media rows → rows completed (or all failed) → notify best-effort
web grid: polls while pending/processing, tiles fill in (videogen pattern)

chat tool (API process)
  └─ same insert + enqueue → poll rows ≤60s → inline images (or pending ids on cap)

workflow step (worker process)
  └─ insert rows + runGenImages inline, no queue hop
```

## Risks / open questions

- **Stale pending rows.** If the worker dies mid-job, rows can sit
  `pending`/`processing` forever; videogen has the same exposure and
  accepts it. A shared janitor cron for both tables is a future follow-up,
  not part of this change.
- **Chat poll interval.** Start at 1s; it only runs while a generation is
  in flight and caps at 60s. Tune at implementation time if it shows up in
  DB load, which it should not at this scale.
