# Video generation v2: BFL FLUX 3 video + draft mode (PRD)

> **Status: implemented** (2026-08-05, three subagents: packages foundation,
> api, web; verification and commit left to the user). Supersedes `prd.md`
> (v1, Veo on Vertex, implemented). v1's architecture is unchanged and is
> only restated here where a decision builds on it. New work: the `bfl`
> video provider, a per-provider capability map, and draft/enhance.

Users can generate videos with Black Forest Labs `flux-3-video` next to the
existing Veo models. BFL adds **draft mode**: a fast, cheap, low-quality
preview that can later be re-rendered at full quality ("enhance") without
paying for a full generation up front. Draft and enhance are billed
separately by BFL.

Everything rides on the existing pipeline: pending `gen_videos` row, BullMQ
job, `experimental_generateVideo()` (the SDK owns provider polling), mp4 to
R2, media row, notification. No structural change.

## Prerequisite

Bump `@ai-sdk/black-forest-labs` from `^2.0.20` to `^2.0.22`. Video support
(`bfl.video('flux-3-video')`, `Experimental_VideoModelV4`) landed in 2.0.22.
Rebuild `@repo/ai` after the bump.

## Verified SDK facts (from the 2.0.22 source, not just docs)

- Model id: `flux-3-video`. One video per call (`n > 1` warns).
- Duration: integer 5 to 20 seconds. Out-of-range values are clamped with a
  warning, fractional values rounded.
- Resolution: two tiers, `hd` (720p) and `fhd` (1080p upsample), set via
  `providerOptions.blackForestLabs.resolution`. A top-level
  `{width}x{height}` resolution is mapped onto a tier, but the provider
  option is the direct path.
- Aspect ratios: `21:9`, `2:1`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `auto`.
- Audio: supported, top-level `generateAudio` maps to `generate_audio`.
- **No seed** and **no negative prompt**. Both are ignored with a warning.
- First frame: our existing `frameImages` / `first_frame` path works (BFL
  `i2v` mode). Last frame, timed keyframes, and video continuation (`v2v`)
  also exist in the SDK but are out of scope here.
- Draft: `providerOptions.blackForestLabs.draft: true` renders the preview.
  The completed result carries
  `providerMetadata.blackForestLabs.videos[0].draftCache`: a **time-limited
  URL** to an encrypted `.bin` bundle.
- Enhance: a new `generateVideo` call with
  `providerOptions.blackForestLabs.draftCache` set to the base64 of the
  downloaded `.bin` (or the URL while still valid). The SDK switches to
  `draft_enhance` mode and sends only the bundle. Prompt, duration,
  resolution, audio, and keyframes are all ignored; the bundle replays the
  exact draft at full quality.
- Result videos come back as URL-type files; the `ai` core downloads them,
  so `video.uint8Array` works as today. All BFL URLs (video and draft cache)
  are time-limited; bytes must be persisted to our storage.
- SDK polling defaults for video: 2s interval, 10 minute timeout. Same
  worker lock-duration considerations as Veo, nothing new.

## Goals

- `flux-3-video` selectable in the videogen form, provider `bfl`, seeded in
  `ai_models` (modality `video`). Veo stays the default-by-modality.
- Per-provider capability map driving both server validation and the form:
  BFL gets the wider aspect-ratio list, a 5 to 20 second duration range, and
  the draft toggle; seed and negative prompt are hidden for it.
- Draft mode in the form: generate a draft, see it in the grid with a Draft
  badge, click Enhance to get the full-quality render as a new row.
- Draft bundles persisted to R2 so enhance does not depend on BFL's URL
  expiry window.

## Non-goals

- Draft mode in the chat agent tool. The tool stays full-quality;
  fire-and-forget chat has no natural place for "now enhance it" yet.
- Last frame, timed keyframes, video continuation, `safetyTolerance`, and
  the `version` pin. SDK supports them; later PRDs if wanted.
- Cost capture from `providerMetadata` (credit system is inert repo-wide:
  design for, ship later).
- Everything already listed as out-of-scope in v1 (WS push, n > 1, inline
  chat playback).

## Design decisions

1. **Two rows linked by parent id, never upgrade in place.** A draft is a
   normal `gen_videos` row with `isDraft: true`; on completion it stores
   `draftCacheKey` (R2 key of the persisted `.bin`) alongside its media row.
   Enhance inserts a **new** pending row with `parentGenVideoId` pointing at
   the draft and goes through the same queue and processor. Rationale: the
   row-per-generation lifecycle (status flow, failure handling,
   notifications, separate billing) falls out for free, and the user keeps
   the playable draft while the enhance renders. Upgrading the draft row in
   place would flip a completed row back to processing and destroy the
   draft.
2. **One enhance per draft.** Enhancing replays the identical bundle, so a
   second enhance costs money for the same output. `requestEnhanceGenVideo`
   rejects when a pending/processing/completed enhance row already exists
   for the parent. A failed enhance can be retried.
3. **Persist the bundle at draft completion.** The `draftCache` URL expires.
   The worker downloads the `.bin` right after the draft completes and
   uploads it to `<userId>/videos/drafts/<uuid>.bin` in the existing bucket.
   The enhance path downloads it from R2 and passes it base64. Risk: BFL may
   also expire bundles server-side after some undocumented window; an old
   draft's enhance would then fail through the normal failed-row path with
   the provider error visible on the tile.
4. **Enhance rows copy the parent's prompt and settings.** BFL ignores them
   anyway; the copy exists so the grid, preview dialog, and notifications
   render without a parent lookup. Provider and model are copied too, and
   the enhance runner rejects a parent whose provider is not `bfl`.
5. **Capability map, one schema.** `generateVideoSchema` stays a single
   superset schema (provider enum gains `'bfl'`, aspect-ratio enum widens,
   duration becomes integer 4 to 20). A `videoGenCapabilities` map keyed by
   provider carries the per-provider constraints (allowed ratios,
   resolutions per ratio, duration range or steps, `supportsSeed`,
   `supportsNegativePrompt`, `supportsDraft`). The service enforces it, the
   API exposes nothing new (the web mirrors the same constants from
   `@repo/ai` as it does today for the v1 enums). This extends the existing
   `supportedResolutionsByAspectRatio` pattern instead of forking a second
   schema.
6. **Storage keeps `720p`/`1080p`.** The stored resolution vocabulary does
   not change. The BFL call path maps `720p` to `hd` and `1080p` to `fhd`,
   the same way the Vertex path maps to `{width}x{height}` dimensions today.
7. **Same queue, same job, same notifications.** Enhance rows reuse
   `GEN_VIDEOS_QUEUE` and `GenVideoJobDto { genVideoId }`; `runGenVideo`
   branches on the row (`parentGenVideoId` set means enhance). The existing
   `video_generation_succeeded/failed` notifications cover drafts and
   enhances; no new notification types.

## Schema (packages/database)

`genvideo.schema.ts` changes:

| column | notes |
| --- | --- |
| isDraft | boolean, not null, default false |
| draftCacheKey | nullable text; R2 key of the encrypted `.bin`, set when a draft completes |
| parentGenVideoId | nullable text, self-FK to `gen_videos.id` (needs the `AnyPgColumn` annotation for the self-reference), indexed; set on enhance rows |

Widen `GenVideoAspectRatio` to the union of Veo and BFL ratios (`'21:9' |
'2:1' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'auto'`).
`GenVideoResolution` and `duration` (already a plain integer) are unchanged.

**Register the self-relation in `relations.ts`** (parent/enhance edges on
the existing `genVideo` entry), or queries touching it throw "relation is
missing". Push via `db:push`, no handwritten SQL.

Query helper additions: `getEnhanceForGenVideo({ parentGenVideoId })` (the
one-enhance-per-draft check) and `parentGenVideoId`/`isDraft`/
`draftCacheKey` passing through `createGenVideoRecord` and
`updateGenVideoStatus`.

## AI package (packages/ai)

`factories/ai-model.factory.ts`:

- Add a `'bfl'` case to `getVideoModel()` using the existing
  `bflAuthOptions` (`createBlackForestLabs(bflAuthOptions).video(model)`).
- Retype `VideoModel` as `Experimental_VideoModelV4` from
  `@ai-sdk/provider` instead of the Vertex-derived `ReturnType` alias.

`services/videogen.service.ts`:

- Constants: `videoGenProviders` gains `'bfl'`; `videoGenAspectRatios`
  widens; `videoGenDurations` is replaced by a per-provider range/steps in
  the new `videoGenCapabilities` map (decision 5). Zod schema: `duration`
  becomes `z.number().int().min(4).max(20)`, `draft: z.boolean().optional()`
  added; per-provider enforcement lives in the service against the
  capability map (reject seed/negativePrompt/unsupported ratio or duration
  for the resolved provider, mirroring `resolveVertexResolution`'s
  warn-and-fallback tone: invalid combinations are rejected at request time,
  not silently coerced, since the user picked them explicitly in the form).
- `createGenVideoRecord`: accepts and stores `isDraft` and
  `parentGenVideoId`.
- New `requestEnhanceGenVideo({ genVideoId, userId, workspaceId })`: loads
  the row, validates it is a completed BFL draft with a `draftCacheKey` in
  the caller's workspace, applies the one-enhance check (decision 2),
  inserts the enhance row copying prompt/settings from the parent, enqueues
  the same job DTO, returns the pending DTO. Enqueue-failure handling
  mirrors `requestGenVideo`.
- `generateAndUploadVideo` branches:
  - **BFL standard/draft**: `providerOptions.blackForestLabs` carries the
    mapped `resolution` tier, `aspectRatio`, and `draft` when the row has
    `isDraft`. Top-level `generateAudio`, `duration`, `frameImages` as
    today. No `seed`, no negative prompt for BFL.
  - **Draft completion**: read
    `providerMetadata.blackForestLabs.videos[0].draftCache`, download the
    `.bin` (plain fetch, it is a signed URL), upload to the drafts prefix,
    return the key so `runGenVideo` stores it on the row with the completed
    status.
  - **Enhance**: download the parent's `.bin` from R2, base64 it, call with
    `providerOptions.blackForestLabs.draftCache` only (plus the model).
    Everything else is ignored by BFL; passing it anyway just produces SDK
    warnings, so the call stays minimal.
  - `maxRetries: 0` stays for all paths (same cost rationale as v1).
- `GenVideoDto` gains `isDraft: boolean` and `parentGenVideoId: string |
  null` so the grid can badge drafts and gate the Enhance action.

## Storage (packages/storage)

`getVideoDraftBucketNameForUser(userId)`: existing bucket, prefix
`<userId>/videos/drafts`. Mirrors `getVideoGenBucketNameForUser`. No public
URL helper: draft bundles are never served to the browser, the worker is
the only reader.

## API (apps/api)

- `POST /workspace/:workspaceId/gen-video/:genVideoId/enhance`: thin
  controller calling `requestEnhanceGenVideo`, returns the pending enhance
  row. Status mapping as implemented: 404 only for a missing or
  wrong-workspace row, 409 when the one-enhance check rejects, 400 when the
  row exists but is not a completed BFL draft (invalid state, matching the
  task/dataset service pattern; deliberate deviation from this PRD's first
  draft, which lumped invalid state into 404).
- `POST /workspace/:workspaceId/gen-video` body: `draft?: boolean` passes
  through; validation schema updated alongside `generateVideoSchema`.
- List response rows include `isDraft` and `parentGenVideoId`.

## Worker (apps/worker)

No new processor. `gen-video.processor.ts` already just calls
`runGenVideo` and enqueues the notification; enhance rows flow through
identically. Draft renders are faster than full renders, so existing lock
durations hold.

## Web (apps/web)

`app/features/video/`:

- **VideoGenForm.vue**: capability-driven per selected model (decision 5).
  For BFL: full aspect-ratio list, duration slider 5 to 20, draft toggle;
  seed and negative-prompt fields hidden. For Veo: exactly today's form.
  Draft default persists in `videogensettings.store.ts`.
- **VideoGenGrid.vue**: a "Draft" badge on `isDraft` tiles. Completed draft
  tiles get an Enhance action; it is disabled (with the reason) when the
  list shows a non-failed enhance row for that draft, and the server check
  is authoritative regardless. Enhance rows render as normal tiles.
- **VideoGenPreviewDialog.vue**: shows the Draft badge and the Enhance
  button for completed drafts; the enhance mutation inserts the pending
  tile like a new generation does.
- **useVideoGenApi.ts**: `enhance` mutation posting to the new endpoint,
  invalidating the list query. Existing conditional poll covers the
  pending enhance row.

## Seeding

New `ai_models` row: provider `bfl`, model `flux-3-video`, modality
`video`, not the default. Seeded by hand like the Veo rows.

## Sequence (delta only)

```
web form (draft toggle on)
  └─ requestGenVideo (isDraft: true) → pending row → gen-video job
worker: runGenVideo (draft path)
  └─ generateVideo(draft: true) → preview mp4 + draftCache URL
  └─ upload mp4 → media row; download .bin → <userId>/videos/drafts/<uuid>.bin
  └─ row → completed + draftCacheKey

web grid: draft tile (Draft badge) → user clicks Enhance
  └─ POST .../gen-video/:id/enhance
       └─ requestEnhanceGenVideo → new pending row (parentGenVideoId) → same job
worker: runGenVideo (enhance path)
  └─ download parent .bin from R2 → generateVideo(draftCache: base64)
  └─ upload full-quality mp4 → media row → row completed
  └─ usual succeeded/failed notification
```

## Risks / open questions

- **Server-side bundle expiry.** BFL does not document how long a
  `draft_cache` bundle stays enhanceable. If old bundles are rejected, the
  enhance row fails visibly with the provider error; acceptable for v1,
  revisit if it bites.
- **Draft quality expectations.** The preview is deliberately low quality;
  the Draft badge plus the Enhance affordance should make that legible
  without extra copy.
- **`auto` aspect ratio** is stored as-is; the grid tile layout must not
  assume the stored ratio matches the file. Resolved at implementation
  time: the grid's fixed CSS aspect classes only covered the two Veo
  ratios, so the web layer added a lookup for all eight, with `auto`
  falling back to `aspect-video`.
- **Duration granularity for Veo** loosened slightly: the schema now
  accepts any integer 4 to 20 and the capability check is a range, so a
  handcrafted API call with duration 5 or 7 for Veo passes validation and
  fails provider-side (failed row with the Vertex error). The form's fixed
  4/6/8 select means the UI can never produce this. Accepted for a
  showcase app.
