# AI-generated content labeling (PRD)

> **Status: implemented** (2026-08-05, PR #18), **revision 1 implemented**
> (2026-08-06). Covers generated images and videos. Motivated by EU AI Act
> Art. 50, applicable since 2026-08-02.
>
> **Revision 1** reworks the processing layer after Docker testing exposed a
> black-video bug: (1) the watermark service, sharp, and the badge asset move
> into the existing `@repo/media` package (already home to the media-library
> type registry, extraction, and refcounted deletion; there was no need for a
> second package); (2) system ffmpeg via `FFMPEG_PATH` instead of the
> `ffmpeg-static` npm package; (3) watermark becomes a best-effort addon,
> never failing a paid render.

Two obligations, two answers:

1. **Machine-readable marking (Art. 50(2))** is treated as handled by the
   model providers (SynthID, C2PA, provider metadata). Our duty shrinks to a
   hard rule: **never disable provider-side marking via a flag**, now or in
   future provider-option edits.
2. **Visible disclosure (Art. 50(4))** is content-dependent, so it ships as
   an optional, user-facing toggle: a visible "AI generated" badge burned
   into the output. Default off.

Rationale for not marking files ourselves: downstream editors (Canva and
similar) strip metadata and C2PA on re-export anyway. The layers that
survive re-processing are pixel-domain watermarks (SynthID, upstream only)
and a visible burn-in (ours). See the discussion summarized here from
2026-08-05.

## Part 1: never disable provider marking

Audit of every generation path (verified against the installed SDKs):

| Provider / path        | Marking                      | Flag exposure                              | Action                                                                                               |
| ---------------------- | ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Vertex Imagen (images) | SynthID, on by default       | `addWatermark`                             | **We currently set `addWatermark: false`** in `imagen.service.ts` (google-vertex branch). Remove it. |
| Vertex Veo (videos)    | SynthID, automatic           | none                                       | Nothing to do.                                                                                       |
| BFL FLUX images        | provider-side (C2PA per BFL) | none in `@ai-sdk/black-forest-labs` 2.0.22 | Nothing to do.                                                                                       |
| BFL flux-3-video       | provider-side                | none in SDK                                | Nothing to do.                                                                                       |
| OpenAI images          | C2PA by default              | none in SDK options we use                 | Nothing to do.                                                                                       |

**The seed consequence.** Imagen rejects `seed` when `addWatermark` is on;
that conflict is why the flag was set to false. Policy: the watermark wins.

- `imagen.service.ts` google-vertex branch: drop `addWatermark` entirely
  (the API default is true) and stop passing `seed` for this provider
  (strip it in the provider-params builder, mirroring how OpenAI silently
  ignores it; the existing warning-surfacing there covers telling the user).
- `ai_models.capabilities.supportsSeed` must stay unset/false for Vertex
  Imagen rows (capabilities are hand-seeded; verify the seed data).
- Guardrail comment on the branch stating the legal constraint, so a future
  "re-enable seed" edit cannot innocently reintroduce `addWatermark: false`.
  Same style as the existing referenceImages guardrail comment there.

No schema, API, or UI change for part 1.

## Part 2: visible watermark toggle

### UX

- A "Label as AI generated" toggle in the imagegen and videogen forms,
  default off, persisted in the respective settings stores like every other
  form default.
- The badge (decided 2026-08-05): styled like the copyright symbol, a thin
  circular ring with the two letters "AI" uppercase centered inside where
  the C would be. Deliberately subtle, barely visible (monochrome,
  semi-transparent, low opacity, no strong contrast). Bottom-right corner,
  margin and diameter scaled to output dimensions (small relative to the
  frame, with a floor so it survives 720p). One SVG asset checked into the
  repo, rasterized at the needed size at runtime. No font dependency
  (ffmpeg `drawtext` would need a font file; an image overlay does not);
  if SVG text rendering proves unreliable in sharp's bundled librsvg,
  outline the letters as paths in the asset.
- Preview dialogs show whether the label was applied, next to the other
  settings.
- Chat agent tools stay unchanged (no toggle exposure) in v1, consistent
  with the draft-mode decision in videogen v2. Later if wanted.

### Data

- `gen_images` and `gen_videos` gain `visibleWatermark` (boolean, not null,
  default false). Stored so the grid and preview can show what was applied
  and so the enhance path can honor it.
- Request schemas (`generateImageSchema`, `generateVideoSchema`) gain
  `visibleWatermark: z.boolean().optional()`.
- DTOs pass it through.

### Processing (revision 1)

The watermark service, its native deps, and the badge asset live in the
existing **`@repo/media`** package, alongside its media-library type
registry, extraction, and refcounted-deletion services. `@repo/ai`'s imagen
and videogen services import `applyImageWatermark`/`applyVideoWatermark`
from it; `@repo/ai` itself drops `sharp` from its dependency list. The badge
SVG is a real asset file (`packages/media/assets/ai-badge.svg`), copied into
`dist/assets/` by tsdown's `copy` option and loaded relative to
`import.meta.url` of the built bundle (proven by a runtime import test; the
first file-based attempt shipped a path that did not exist in dist).

- `applyImageWatermark({ buffer, mimeType })`: `sharp` composite of the
  rasterized badge onto the image. Runs in the imagegen path (synchronous,
  API process) after generation, before upload. Adds tens of milliseconds.
- `applyVideoWatermark({ buffer })`: ffmpeg overlay, worker process, all
  routes (async job, workflow inline, draft, enhance), after generation and
  before upload. Version-proof pipeline in three steps: (1) probe the
  video's dimensions with a first ffmpeg pass (`ffmpeg -i input`, no
  ffprobe binary anywhere in this stack), parsing the `Stream #...Video:...`
  line from stderr for its `WxH` token; (2) compute badge diameter (4% of
  height, floor 16px; shrunk from 12%/48px after user review, 2026-08-06)
  and margin (3% of height) in Node and rasterize the badge with sharp; (3) one plain `overlay` filter with the margin as a
  precomputed integer, video re-encoded to libx264/yuv420p, audio copied
  (`-c:a copy`, optional stream, `0:a?`). No `scale2ref`, no in-graph
  scaling of any kind. The args builder (`buildWatermarkFfmpegArgs`) is a
  pure function, exported standalone for testing. Temp files in
  `os.tmpdir()`, cleaned up in a finally block.

**ffmpeg comes from the system, not npm** (decided 2026-08-06). The
service spawns the plain `ffmpeg` binary via PATH lookup; no config knob
(an earlier `FFMPEG_PATH` env var was built and then removed as
unnecessary). Dev machines install it via brew (user-managed);
`apps/worker/Dockerfile` installs it via apt in its runner stage (the
worker is the only process that spawns ffmpeg; the API only uses sharp),
and both put it on PATH.
The `ffmpeg-static` npm package is dropped entirely, including its
`allowBuilds` entry.

Why the rework: `ffmpeg-static` ships ffmpeg 6.0 on macOS but 7.0.2 on
Linux. The original `scale2ref`-based filter graph works on 6.0, but on
7.0.2 it exits 0 while writing an mp4 with no video stream at all (audio
only, renders black); ffmpeg 8 removed `scale2ref` entirely, so brew
ffmpeg would hard-fail too. The probe-plus-plain-overlay pipeline was
verified 2026-08-06 against local brew ffmpeg 8.1.2 (macOS) and Debian
bookworm's packaged ffmpeg 5.1.9 (`node:24-slim` + `apt-get install
ffmpeg`, the same Linux base the Docker image uses): both produce a
48-frame output with its video and audio streams intact and a non-black
frame midway through the clip.

### Interaction with videogen v2 draft/enhance

The burn-in is applied to what **we** store, never to what we send to BFL.
Enhance replays the provider-side draft bundle, so any label baked into a
draft would not survive into the enhanced render. Therefore:

- Draft rows with the toggle on get the badge burned into the draft mp4.
- Enhance rows copy `visibleWatermark` from the parent (alongside the other
  copied settings per v2 decision 4) and the badge is applied again to the
  enhanced mp4 after download.

### Failure semantics (revision 1)

Every generated output is saved and accessible; the watermark is a
best-effort addon (decided 2026-08-06, replacing the original
fail-the-generation rule). A render is paid for and must never be lost to
a labeling problem. The watermark is attempted in memory before the single
upload; on failure the raw bytes are uploaded instead, the calling service
logs a warning, and the row's `visibleWatermark` flips to false. The
column thereby records the **outcome** ("the stored file carries the
badge"), not the request, so the preview dialogs stay truthful with no web
changes.

### Sequence (video, delta only)

```
worker: runGenVideo (any route, row has visibleWatermark)
  └─ generateVideo(...) → mp4 bytes
  └─ applyVideoWatermark (ffmpeg overlay, audio copy)
  └─ upload labeled mp4 → media row → completed
```

## Out of scope (later)

- Own metadata / C2PA injection (provider-handled by assumption; revisit if
  a provider ships unmarked outputs or provenance verification is demanded).
- Watermark toggle on the chat agent tools.
- Detection/verification tooling for uploaded third-party content
  (Art. 50 deepfake disclosure for user uploads is the user's duty, not a
  platform feature here).
- Custom badge text, position, or localization.

## Risks / open questions

- **Vertex Imagen seed removal is a behavior change.** Anyone relying on
  reproducible Imagen outputs loses that; acceptable for a showcase app and
  required by the policy.
- **ffmpeg re-encode cost.** Seconds of CPU per clip in the worker,
  serialized with the existing concurrency limits; negligible next to
  multi-minute renders.
- **Badge legibility on `auto` aspect ratio (BFL)** must be checked against
  a real output at implementation time, since stored ratio and file ratio
  can differ.
- **"Barely visible" is a product decision.** Art. 50(4)'s visible
  disclosure arguably expects clear visibility; a subtle badge is a
  deliberate trade-off, accepted 2026-08-05. Easy to revisit by swapping
  the single SVG asset.
