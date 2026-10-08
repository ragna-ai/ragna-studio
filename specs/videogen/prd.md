# Video generation (PRD)

> **Status: superseded** by `prd-v2.md` (2026-08-05), which adds the BFL
> `flux-3-video` provider and draft/enhance on top of the architecture
> described here. Originally proposed 2026-07-23 and implemented as written.
> Mirrors the image generation feature
> (`packages/ai/src/services/imagen.service.ts`, `apps/web/app/features/image/`)
> wherever possible; deviates only where video latency forces it.

> **Update (2026-10-05):** `frame-upload` now stores the file via
> `@repo/media` as a workspace media row and returns `{ mediaId, imgUrl }`.
> Generate bodies take `{ origin: 'upload', mediaId }`, resolved
> workspace-scoped (404 otherwise). The `storageKey` round trip described
> below no longer exists; abandoned uploads are swept by the media-sweep cron.

Users can generate videos from a text prompt, optionally animating a first-frame
image, on a dedicated `/text-to-video` page and through a chat agent tool.
Results are stored in R2 and listed per workspace, like generated images.

The one structural difference from imagegen: Veo takes roughly 30 seconds
(fast models) to several minutes (quality models) per clip. A synchronous
HTTP round trip is off the table, so generation runs as a BullMQ job with a
pending DB row, and completion is surfaced via the notification system.

## Goals

- Text-to-video and image-to-video via Google Veo on Vertex. The
  `getVideoModel()` factory in `packages/ai/src/factories/ai-model.factory.ts`
  already exists; the `video` modality already exists in `ai_models`.
- `gen_videos` table with a lifecycle status; POST returns pending rows
  immediately, a worker job does the slow part.
- Gallery page `/text-to-video` mirroring `/text-to-image`: form, grid,
  preview dialog, settings store. Pending tiles poll until resolved.
- Fire-and-forget agent tool: enqueues, returns the pending id, the agent
  tells the user the video is on its way.
- Completion and failure notifications through the existing
  `NotificationDataMap` pattern.
- mp4s live in the existing images bucket under a
  `<userId>/videos/generated/` prefix. No new bucket or domain.

## Non-goals

- WS push delivery. The grid polls while rows are pending; when
  `specs/notifications/ws-push-prd.md` ships, the poll swaps for a cache
  invalidation on the notification frame. Nothing here blocks on it.
- `n > 1` per request. Veo is slow and expensive; one clip per job.
- Inline video playback in chat for tool-generated videos (v1 returns a
  pending id, not a URL; see decision 2).
- Video extension, remixing, or reference-to-video (`inputReferences`).
- OpenAI / BFL video providers. Their AI SDK packages (as installed) expose
  no video models.
- Cost tracking and quotas (repo-wide: design for, ship later).

## Design decisions

1. **Async job, status on the row.** `gen_videos` carries
   `status: 'pending' | 'processing' | 'completed' | 'failed'`, a nullable
   `storageKey`, and a nullable `error`. The row is created pending, the job
   carries only `{ genVideoId }`, and the worker reads everything else from
   the row. No separate jobs table; the record users see is the record the
   worker updates.
2. **Fire-and-forget in chat, await inline in workflows.** In chat, the
   tool creates the pending row, enqueues, and immediately returns
   `{ id, status: 'pending' }`: the stream never blocks on a multi-minute
   render, and a dropped stream cannot orphan a generation. The video lands
   in the gallery plus a notification. Inline chat playback is a later
   enhancement, not v1.
   Workflows are different: they already run inside the worker process, and
   a fire-and-forget tool would let the run finish before the video exists,
   so downstream steps could never consume it. Both workflow executors
   (`team.executor.ts`, `run-referenced-agent.ts`) build the same toolset
   via `buildAgentToolset`, so the toolset context gains an
   `awaitGeneration: boolean` flag (chat: false, workflow executors: true).
   Same tool id, no second user-facing toggle. The awaiting variant calls
   `createGenVideoRecord` + `runGenVideo` inline (no queue hop) and returns
   `{ id, status: 'completed', videoUrl }` for downstream steps.
   Notifications are only emitted by the gen-video processor, so the inline
   path emits none; the existing `workflow_run_succeeded/failed`
   notification covers the run.
3. **First-frame input mirrors social-post media.** `gen_videos` gets
   `frameOrigin: 'upload' | 'genImage' | null` and a nullable
   `frameStorageKey`, the same ownership split as
   `social-post.schema.ts`: `genImage` rows reference a `gen_images` object
   they don't own (no copy); `upload` rows own their object under
   `<userId>/videos/frames/`. The AI SDK's `frameImages` (frameType `first`)
   receives the downloaded bytes.
4. **Same bucket, new prefix.** Keys are
   `<userId>/videos/generated/<uuid>.mp4` in `cfImagesBucketName`, served
   from the existing public domain. New helpers `getVideoGenBucketNameForUser`
   and `buildVideoUrls` in `@repo/storage` mirror the image ones.
5. **Default model by modality.** The tool and the form default resolve via
   `getDefaultAiModelByModality({ modality: 'video' })`. Seed `ai_models`
   with Veo rows (`veo-3.1-fast-generate-preview` as default,
   `veo-3.1-generate-preview` as the quality option), provider
   `google-vertex`.
6. **The SDK owns provider polling.** `experimental_generateVideo()` polls
   Vertex until the operation completes and returns the bytes. The worker
   just awaits it; the job timeout must be generous (10 minutes).
7. **`@repo/ai` gains a `@repo/queue` dependency.** Chat tools in
   `packages/ai` are self-contained (the image tool talks to the database
   directly). Keeping that pattern, the enqueue helper lives in
   `@repo/ai`'s videogen service rather than injecting a callback from the
   API.
8. **Poll only while pending.** `useVideoGenApi`'s list query sets a
   `refetchInterval` of ~5 seconds only when the current page contains a
   pending/processing row, otherwise no interval. This is the temporary
   stand-in for WS push.

## Schema (packages/database)

New `packages/database/src/schema/genvideo.schema.ts`:

| column                  | notes                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| id, userId, workspaceId | as `gen_images`; both FKs cascade, both indexed                                           |
| status                  | text, `'pending' \| 'processing' \| 'completed' \| 'failed'`, not null, default `pending` |
| storageKey              | nullable until the worker uploads the mp4                                                 |
| error                   | nullable text, set on failure                                                             |
| prompt, negativePrompt  | as `gen_images`                                                                           |
| provider, model         | as `gen_images`                                                                           |
| aspectRatio             | `'16:9' \| '9:16'`                                                                        |
| resolution              | `'720p' \| '1080p'`                                                                       |
| duration                | integer seconds (4 / 6 / 8)                                                               |
| generateAudio           | boolean, default true                                                                     |
| seed                    | nullable integer                                                                          |
| frameOrigin             | nullable, `'upload' \| 'genImage'`                                                        |
| frameStorageKey         | nullable; object key of the first-frame image                                             |

Query helpers mirror the image ones: `createGenVideoRecord`,
`getGenVideosByWorkspaceId` (paged), `getGenVideoCountByWorkspaceId`,
`getGenVideoById`, `updateGenVideoStatus`.

**Register the table in `relations.ts`** (schema object + user/workspace FK
relations), or every query throws "relation is missing".

## Queue (packages/queue)

- `constants/index.ts`: `GEN_VIDEOS_QUEUE = 'gen-videos-queue'`, plus two
  `NotificationDataMap` entries:
  - `video_generation_succeeded: { genVideoId: string; workspaceId: string; prompt: string }`
  - `video_generation_failed: { genVideoId: string; workspaceId: string; prompt: string }`
    (`prompt` snapshotted so the presenter can render without a lookup; truncate
    for display in the presenter, not at emit.)
- `dtos/gen-video-job.dto.ts`: `GenVideoJobDto { genVideoId: string }`,
  same class shape as `NotifyUserJobDto`.
- Worker's notification registry gets builders for both new types.

## AI package (packages/ai)

New `src/services/videogen.service.ts`, two halves:

- **Request side** (API + chat tool): `requestGenVideo(params)` validates,
  resolves provider/model (explicit from the form, or default-by-modality
  from the tool), inserts the pending `gen_videos` row, enqueues
  `GenVideoJobDto`, returns the row DTO. Exports the Zod schema
  (`generateVideoSchema`) and the enum constants
  (`videoGenAspectRatios = ['16:9', '9:16']`,
  `videoGenResolutions = ['720p', '1080p']`,
  `videoGenDurations = [4, 6, 8]`) like `imagen.service.ts` does.
- **Run side**: `runGenVideo({ genVideoId })` loads the row, flips it
  to `processing`, downloads the first-frame image from R2 when
  `frameStorageKey` is set, calls `experimental_generateVideo()` with
  `getVideoModel()`, uploads the mp4, updates the row to `completed` with
  the `storageKey`. Any failure sets `failed` + `error` and rethrows.
  Called from two places: the gen-video processor (async path) and the
  awaiting tool variant in workflows (inline path). Notification
  enqueueing happens only in the processor, not here.

Veo parameter constraints (which duration/resolution/aspect combinations each
model accepts, e.g. 1080p availability per model) must be verified against
the Vertex Veo docs at implementation time and encoded as a per-model
capability map, the way `ratiosResolutionMap` does for images.

New `src/tools/video-gen.tool.ts` modeled on `image-gen.tool.ts`:

- Input: `prompt` (required), `aspectRatio?`, `duration?`, `generateAudio?`,
  `genImageId?` ("animate a previously generated image"; the tool resolves
  the id to its storage key and rejects ids outside the workspace). Flat
  `z.object` only, no top-level unions (Anthropic 400s otherwise).
- Emits a transient `data-videoGen` part `{ prompt }` like `data-imageGen`
  (workflows pass `noopWriter`, so this is chat-only for free).
- Behavior switches on the new toolset context flag (decision 2):
  - `awaitGeneration: false` (chat): executes `requestGenVideo` with the
    default video model and returns `{ video: { id, status: 'pending' } }`,
    plus a short instruction in the description that the tool is
    asynchronous: the agent should tell the user the video is being
    generated and will appear in the video gallery and as a notification.
  - `awaitGeneration: true` (workflows): calls `createGenVideoRecord` +
    `runGenVideo` inline and returns
    `{ video: { id, status: 'completed', videoUrl } }` so downstream
    workflow steps can use the URL. Same output shape, `videoUrl` optional.
- Register in `agent.tools.ts` and add the entry to `AgentToolList.vue`.
  Add `awaitGeneration` to the `ToolsetFactory` context: chat wiring passes
  `false`, `team.executor.ts` and `run-referenced-agent.ts` pass `true`.

## Storage (packages/storage)

In `lib/image-urls.ts` (or a sibling `video-urls.ts`):

- `getVideoGenBucketNameForUser(userId)` → existing bucket,
  prefix `<userId>/videos/generated`.
- `getVideoFrameBucketNameForUser(userId)` → prefix `<userId>/videos/frames`.
- `buildVideoUrls({ userId, key })` → same shape as `buildImageUrls`
  (`rawUrl` + public `videoUrl` on the existing domain).

## API (apps/api)

`controllers/videogen.controller.ts` + `services/videogen.service.ts`
(thin controller, logic in the service), validation in
`validation/gen-video.schema.ts`:

- `GET /workspace/:workspaceId/gen-video` — paged list, newest first.
  Response rows include `status` and `error`; `videoUrl` only when
  completed.
- `POST /workspace/:workspaceId/gen-video` — body per `generateVideoSchema`
  plus optional `frame: { origin: 'genImage', genImageId } | { origin: 'upload', storageKey }`.
  Calls `requestGenVideo`, returns the pending row (202 semantics, but a
  plain 200 with `status: 'pending'` matches the codebase style).
- `POST /workspace/:workspaceId/gen-video/frame-upload` — multipart image
  upload to `<userId>/videos/frames/<uuid>.<ext>`, returns the storage key.
  Follows the social-post media upload service pattern.

## Worker (apps/worker)

`processors/gen-video.processor.ts`, registered in `processors/index.ts`:

- Consumes `GEN_VIDEOS_QUEUE`, calls `runGenVideo({ genVideoId })`.
- On success, enqueues `NotifyUserJobDto` with `video_generation_succeeded`;
  on failure `video_generation_failed`. Notification enqueue is
  best-effort (log, never fail the job over it).
- Concurrency 1–2 and no BullMQ retries for the generation job itself
  (a failed multi-minute render should surface, not silently rerun and
  double the cost).
- **Lock durations**: both the gen-videos worker and the existing
  workflows worker (which now may block 1–6 minutes on an inline
  `runGenVideo` from a workflow step) need a `lockDuration` /
  stalled-check configuration that tolerates multi-minute jobs, or BullMQ
  marks them stalled mid-render. Verify the current worker factory
  settings in `@repo/queue` at implementation time.

## Web (apps/web)

`app/features/video/`, mirroring `features/image/`:

- `components/VideoGenForm.vue` — prompt, model select, aspect ratio,
  resolution, duration, audio toggle, negative prompt, seed, and an optional
  first-frame picker (choose from the user's generated images, or upload).
  Submit inserts a pending tile immediately.
- `components/VideoGenGrid.vue` — tiles are `<video preload="metadata">`
  with poster-on-hover play, pending/processing tiles show a spinner +
  prompt, failed tiles show the error with the prompt preserved for retry.
- `components/VideoGenPreviewDialog.vue` — full-size `<video controls>`,
  prompt + settings, download link.
- `composables/useVideoGenApi.ts` — list query with conditional
  `refetchInterval` (~5s while any visible row is pending/processing),
  create mutation, frame-upload mutation.
- `stores/videogensettings.store.ts` — persisted form defaults, like
  `imagegensettings.store.ts`.
- `pages/text-to-video/index.vue` + nav entry next to text-to-image.
- Notification presenters for the two new types (deep-link to
  `/text-to-video`).
- `ChatMessage.vue`: render the transient `data-videoGen` part
  ("Generating video…"), like `data-imageGen`.

## Sequence

```
web form / chat tool (async path)
  └─ requestGenVideo (@repo/ai)
       ├─ insert gen_videos row (status: pending)
       └─ enqueue GenVideoJobDto { genVideoId }
  └─ responds immediately (pending row / pending tool result)

workflow step (inline path, already in the worker)
  └─ createGenVideoRecord + runGenVideo awaited inline
  └─ tool returns { id, status: 'completed', videoUrl } to the next step
     (no gen-video job, no videogen notification)

worker: gen-video.processor
  └─ runGenVideo (@repo/ai)
       ├─ row → processing
       ├─ [frameStorageKey?] download first-frame image from R2
       ├─ experimental_generateVideo (SDK polls Vertex until done)
       ├─ upload mp4 → <userId>/videos/generated/<uuid>.mp4
       └─ row → completed + storageKey   (or failed + error)
  └─ enqueue notify-user job (succeeded/failed)

web: /text-to-video grid
  └─ polls list every ~5s while a pending tile exists
       └─ tile flips to playable video (or error state)
  └─ notification badge updates on the next unread-count poll
     (WS push replaces both polls when it lands)
```

## Out of scope (later)

- WS push integration: on a `video_generation_*` notification frame,
  invalidate the videogen list query instead of interval polling.
- Inline chat playback: a `data-videoGen` part that carries the pending id
  and resolves client-side, or the tool optionally awaiting fast models.
- Multiple clips per request, video extension, last-frame /
  first-and-last-frame modes, reference images.
- Reusing generated videos in social posts (extend
  `SocialPostMediaOrigin` with `'genVideo'`).
