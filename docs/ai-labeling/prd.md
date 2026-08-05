# AI-generated content labeling (PRD)

> **Status: proposed** (2026-08-05). Covers generated images and videos.
> Motivated by EU AI Act Art. 50, applicable since 2026-08-02. Implementation
> must start **after** videogen v2 (`docs/videogen/prd-v2.md`) lands: both
> touch `videogen.service.ts`, the `gen_videos` schema, and the video form.

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

| Provider / path | Marking | Flag exposure | Action |
| --- | --- | --- | --- |
| Vertex Imagen (images) | SynthID, on by default | `addWatermark` | **We currently set `addWatermark: false`** in `imagen.service.ts` (google-vertex branch). Remove it. |
| Vertex Veo (videos) | SynthID, automatic | none | Nothing to do. |
| BFL FLUX images | provider-side (C2PA per BFL) | none in `@ai-sdk/black-forest-labs` 2.0.22 | Nothing to do. |
| BFL flux-3-video | provider-side | none in SDK | Nothing to do. |
| OpenAI images | C2PA by default | none in SDK options we use | Nothing to do. |

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

### Processing

New `packages/ai/src/services/watermark.service.ts` with two exported
helpers, used by imagen and videogen services (both live in `@repo/ai`, so
the helpers do too; no new package):

- `applyImageWatermark({ buffer, mimeType })`: `sharp` composite of the
  rasterized badge onto the image. Runs in the imagegen path (synchronous,
  API process) after generation, before upload. Adds tens of milliseconds.
- `applyVideoWatermark({ buffer })`: ffmpeg overlay. Runs in the videogen
  path (worker process, all routes: async job, workflow inline, draft,
  enhance) after generation, before upload. Video stream re-encodes with
  the overlay filter (badge scaled relative to the main input); audio
  stream is copied (`-c:a copy`). Input/output via temp files in
  `os.tmpdir()`, cleaned up in a finally block.

Dependencies added to `@repo/ai`: `sharp` and `ffmpeg-static` (pinned
binary, spawned via `node:child_process`; no wrapper lib). `ffmpeg-static`
keeps the worker portable instead of requiring a system ffmpeg. The API
process never invokes ffmpeg; only sharp.

### Interaction with videogen v2 draft/enhance

The burn-in is applied to what **we** store, never to what we send to BFL.
Enhance replays the provider-side draft bundle, so any label baked into a
draft would not survive into the enhanced render. Therefore:

- Draft rows with the toggle on get the badge burned into the draft mp4.
- Enhance rows copy `visibleWatermark` from the parent (alongside the other
  copied settings per v2 decision 4) and the badge is applied again to the
  enhanced mp4 after download.

### Failure semantics

The toggle is explicit user intent, so a failed watermark step fails the
generation (row goes to `failed` with the error), rather than silently
delivering an unlabeled file. The user can retry, with or without the
toggle.

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
