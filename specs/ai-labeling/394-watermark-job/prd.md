# AI labeling: label in its own job, image tools out of the api (PRD)

> **Status: decided** (2026-11-14). Issue #394. Extends [the AI labeling PRD](../prd.md) and
> replaces its "Processing (revision 1)" and "Failure semantics" sections.

The api ships and loads sharp, although every image and video task runs in the worker. It comes in
through `@repo/media` and `@repo/ai`, which both bundle the resize and watermark code. If sharp
breaks, the api fails at boot.

This PRD moves that code into a package only the worker depends on. It also gives the visible AI
label its own job. A generated output is stored first, then labeled, and only then shown to anyone.

## Problem

- **Dependency tree.** `@repo/media`'s entry re-exports `shrinkAgentImage` and the watermark
  services, so `import { storeMedia } from '@repo/media'` loads sharp. `@repo/ai`'s generation
  services import the watermark. The api image carries sharp, libvips and a C++ runtime stage
  for code it never calls.
- **The label has no retry.** The watermark runs in memory between generating and uploading. One
  failed attempt stores the output without the label for good.
- **A crash during labeling loses the render.** Nothing is stored until the label is done, so a
  worker crash or an ffmpeg error mid-way throws away a paid generation.

## Goals

- The api neither ships nor loads sharp, libvips or the ffmpeg code.
- An output with the label requested only becomes visible once it carries the label, or once
  labeling has finally failed.
- A paid render is stored before any labeling starts.
- **Success signal:** `sharp` is absent from `/prod/api/node_modules` after
  `pnpm --filter @repo/api deploy --prod`. The worker image smoke stays green.

## Non-goals

- anydoc's `extractText` in the api request path. Separate decision, noted in #394.
- The label toggle on chat and workflow tools. They still never request it, as in the labeling
  PRD. Adding it later must add a wait for the watermark job to the inline workflow path.
- A sweep for unlabeled objects left behind by a lost job. Follow-up issue if it happens.

## User stories

Roles: user (anyone generating images or videos in a workspace).

### US-1 Labeled outputs are never shown unlabeled (P1)

As a user who turns on the AI label, I want to see my image or video only once it carries the
label, so that I can't share an unlabeled AI output by accident.

- **US-1.1** Given an image or video generation with the label on, when the generation finishes,
  then it stays in progress and has no media until the watermark job has run.
- **US-1.2** Given the watermark job succeeds, when the output appears, then it carries the badge, the
  AI label row shows "Applied", and the user gets the success notification once.
- **US-1.3** Given labeling fails on every attempt, when the last attempt ends, then the output is
  still saved without the badge and the AI label row is empty.
- **US-1.4** Given a generation with the label off, when it finishes, then it completes right away,
  as today, and no watermark job runs.

### US-2 A render survives a labeling problem (P1)

As a user, I want a paid generation to be kept even if labeling breaks, so that I never pay for an
output I can't get.

- **US-2.1** Given a watermark job that fails once, when it is retried and succeeds, then the output
  carries the badge.
- **US-2.2** Given a draft or enhance video with the label on, when it completes, then its stored
  mp4 carries the badge and the draft can still be enhanced.

### US-3 The api runs without image tools (P1)

As a self-hoster, I want the api image to contain only what the api runs, so that it is smaller and
can't fail at boot because of a native image library.

- **US-3.1** Rule: the api's production dependency tree contains no `sharp`.
- **US-3.2** Given an agent image upload, when the worker processes it, then the agent mark is
  80 × 80 PNG, as today.

## Testing

| Criterion | Level                       | Folder                          |
| --------- | --------------------------- | ------------------------------- |
| US-1.1    | worker                      | `apps/worker/test/generation/`  |
| US-1.2    | worker                      | `apps/worker/test/generation/`  |
| US-1.3    | worker                      | `apps/worker/test/generation/`  |
| US-1.4    | worker                      | `apps/worker/test/generation/`  |
| US-2.1    | worker                      | `apps/worker/test/generation/`  |
| US-2.2    | worker                      | `apps/worker/test/generation/`  |
| US-3.1    | build (`pnpm deploy` check) | `scripts/image-smoke/`          |
| US-3.2    | worker                      | `apps/worker/test/agent-image/` |

Real sharp runs in the worker tests. ffmpeg runs in the worker image smoke (mp4 and webm); worker
tests fake the video transform, so they don't depend on an ffmpeg install. The api tests don't change
apart from `runsInWorker` fixtures.

## Standards checklist

- **Deletion:** the unlabeled object is deleted once the labeled one is stored. Workspace and
  media deletion are unchanged: both only see the final object.
- **Retention:** unlabeled objects live from generation to labeling, seconds to minutes. A lost
  job can leave one behind under the `unlabeled/` prefix (see Non-goals).
- **Erasure:** n/a. No new personal data. Objects stay under the author's prefix.
- **Docs:** `apps/docs/src/content/docs/media/ai-labeling.mdx` gets one sentence: with the label
  on, the output appears once the badge is applied.

## Decisions

**Store, then label in a separate job.** Labeling moves out of generation into its own queue
with retries. The output is stored under an internal key before labeling, and the gen row stays
`processing` until the watermark job completes it. The alternative was passing the watermark function
into `@repo/ai`'s generation. That was smaller, but kept a single unretried attempt and lost the
render on a crash.

**A pure `@repo/media-transform` package, worker only.** Bytes in, bytes out: resize, image and
video watermark, the ffmpeg util and the badge asset. It has no database, storage or `@repo/media`
dependency. Reading rows and objects stays in the worker processors. A folder in `apps/worker`
lost: the image smoke script and the badge asset both need a package entry.

## Design

**`@repo/media-transform`** (new, `pnpm gen package`). Exports `resizeImageToSquarePng`,
`applyImageWatermark`, `applyVideoWatermark`, `probeVideoDimensions`. Takes over `sharp`, the
badge SVG and its tsdown `copy` rule from `@repo/media`. Only `apps/worker` depends on it.
`@repo/media` drops `sharp`, `agent-image.service.ts`, `watermark.service.ts` and
`watermark-ffmpeg.util.ts`.

**Agent image.** `agent-image.processor.ts` loads the media row, downloads, calls the resize,
uploads, updates the row and deletes the original, the steps `shrinkAgentImage` does today.

**Generation (`@repo/ai`).** `runGenImages` / `runGenVideo` generate and upload the raw output.

- Label off: complete as today (media row, `completed`).
- Label on: upload under `<prefix>/unlabeled/<uuid>`, keep the row `processing`, enqueue the
  watermark job with the output keys (and the video's `draftCacheKey`), and return `{ outcome: 'watermarking' }`.
- Completion moves into exported `completeGenImages` / `completeGenVideo`, called by both paths.
- The return type is a union, `{ outcome: 'completed', ... } | { outcome: 'watermarking' }`. The gen
  processors only send the success notification on `completed`.
- The inline workflow path asserts `completed`. Tools never request the label (see Non-goals).

**Watermark job (worker).** Queue `VISIBLE_WATERMARK_QUEUE = 'visible-watermark'`, job
`APPLY_VISIBLE_WATERMARK_JOB = 'apply-visible-watermark'`, DTO in `@repo/queue` as a
discriminated union on `kind: 'image' | 'video'`. Processor `visible-watermark.processor.ts`, own concurrency (2), 3 attempts with
exponential backoff. Each attempt: download raw, label, upload under the final key, complete the
row with `visibleWatermark: true`, notify, delete the raw object. The last failed attempt completes
the row with the raw object and `visibleWatermark: false`, then notifies. The processor takes the
transform functions through a deps object, so tests can fake the video transform.

**api image.** Check whether anydoc loads on plain `oven/bun` distroless. If it does, drop
`cxx-runtime` from `apps/api/Dockerfile`; otherwise keep only the libraries anydoc needs. The image
smoke script imports the watermark from `@repo/media-transform`.
