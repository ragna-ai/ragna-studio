# Image generation: advanced inputs (PRD)

> **Status: implemented** (2026-07-25). Extends the existing image generation
> feature (`packages/ai/src/services/imagen.service.ts`,
> `apps/web/app/features/image/`) with the inputs videogen already has:
> negative prompt, seed, and reference images. Mirrors
> `specs/videogen/prd.md` wherever the two features overlap.

> **Update (2026-10-05):** `reference-upload` now stores the file via
> `@repo/media` as a workspace media row and returns `{ mediaId, imgUrl }`.
> Generate bodies take `{ origin: 'upload', mediaId }`, resolved
> workspace-scoped (404 otherwise). The `storageKey` round trip described
> below no longer exists; abandoned uploads are swept by the media-sweep cron.

Users can steer an image generation beyond the prompt: exclude content with a
negative prompt, reproduce a result with a seed, and condition on up to four
reference images picked from the gallery or uploaded. Which of those are
offered depends on the selected model, read from `ai_models.capabilities`.

The structural difference from videogen: none. Image generation stays
synchronous (no queue, no pending rows). This is an input-surface change plus
a capability model.

## Goals

- Negative prompt and seed exposed in the `/text-to-image` form and in the
  chat agent's image tool.
- Reference images (`bfl` and `openai` only) with the same
  gallery-or-upload split videogen uses for first frames.
- Per-model capability flags stored in `ai_models.capabilities`, so the form
  disables what the selected model cannot honour instead of silently
  dropping it.
- The preview dialog shows the settings behind a generation and can load
  them back into the form.

## Non-goals

- Reference images for `google-vertex` (see decision 3).
- Masks / inpainting. Reference images condition the whole generation; no
  region selection.
- `prompt_upsampling` / `disable_pup`, still blocked by the SDK
  (`specs/imagegen-known-issues.md`).
- Backfilling `capabilities` for text and video models. The column is fixed
  repo-wide, but seeding values beyond image models is out of scope here.
- Cost tracking and quotas (repo-wide: design for, ship later).

## Design decisions

1. **Capabilities live in the database, not in code.** `ai_models.capabilities`
   gains optional image-input flags. Nothing is hardcoded per provider or
   model id in `@repo/ai`, so adding a model is a data change.
   **Fail closed:** a flag that is absent or `false` means the feature is
   unavailable. Until rows are seeded, the advanced options render disabled.
   The same rule is enforced server side, so a hand-crafted request cannot
   sneak an unsupported field past the UI.
2. **The request body carries `aiModelId`, not `provider` + `model`.** One
   lookup yields provider, model and capabilities together. `gen-video` still
   sends the pair; migrating it is a separate change (no backward compat
   needed, repo-wide).
3. **Reference images are `bfl` + `openai` only.** The AI SDK's unified
   `prompt: { text, images }` reaches all three providers, but
   `@ai-sdk/google-vertex` maps it to Imagen's edit endpoint with a
   hardcoded `editMode: 'EDIT_MODE_INPAINT_INSERTION'` and only
   `REFERENCE_TYPE_RAW` references. That is inpainting without a mask, not
   subject or style conditioning, and it needs a capability model
   (`imagen-3.0-capability-001`). Vertex ships with
   `supportsReferenceImages` unset; the gap is recorded in
   `specs/imagegen-known-issues.md`.
4. **References mirror `gen_videos.frameOrigin`, as a list.** A single jsonb
   column on `gen_images` rather than a child table: references are always
   read with the row and never queried on their own. Same ownership split as
   `social_post_media` and `gen_videos`: `genImage` entries reference a
   `gen_images` object the row does not own (no copy), `upload` entries own
   their object under `<userId>/images/references/`.
5. **Cap references at 4.** BFL accepts 10 (`input_image` ..
   `input_image_10`) and OpenAI more, but four is the practical limit for a
   picker and keeps the request body small. The cap is per model
   (`maxReferenceImages`), clamped to 4 by the request schema.
6. **Surface SDK warnings.** `generateImage()` returns a `warnings` array
   (this is where "seed unsupported" on OpenAI appears). It is currently
   discarded. Log it at warn level so a capability row that disagrees with
   the SDK is visible.
7. **Agent tool gets seed and negative prompt only.** Both are flat optional
   fields on the tool's `inputSchema` (a top-level union breaks Anthropic
   tool validation). Reference images need an id or an upload the agent does
   not have; the page owns that.

## Prerequisite: the `capabilities` column is broken

`packages/database/src/schema/aimodel.schema.ts:44` declares:

```ts
capabilities: jsonb('capabilities').default('{}').$type<AiModelCapabilities>(),
```

Drizzle JSON-serialises the default, so every row stores the JSON _string_
`"{}"`, not an object. Verified against the dev database:

```
          model          | capabilities | jsonb_typeof
-------------------------+--------------+--------------
 imagen-4.0-generate-001 | "{}"         | string
 gpt-image-1             | "{}"         | string
 flux-2-max              | "{}"         | string
```

Harmless so far because nothing reads the column, and property access on a
string returns `undefined` rather than throwing. It must be fixed before
gating hangs off it:

```ts
capabilities: jsonb('capabilities').default({}).notNull().$type<AiModelCapabilities>(),
```

The adjacent `meta` column has the identical bug and was fixed the same way
(`.default({}).notNull()`). Nothing read it either, but anything that starts
to must not assume the old rows held an object.

Then `db:push`. Existing rows keep their `"{}"` string value, so they need a
one-off `UPDATE ai_models SET capabilities = '{}'::jsonb` (or a re-seed);
same for `meta`. Both affected all 13 rows in the dev database.
Seeding the actual per-model flags is handled manually by the maintainer, not
by this change: with fail-closed defaults, an unseeded row simply shows every
advanced option as unavailable.

Reference values for the image rows currently in the database (`flux-2-max`,
`flux-2-flex`, `flux-2-pro-preview`, `gpt-image-1`,
`imagen-4.0-generate-001`), derived from the installed SDKs:

| model                                     | supportsNegativePrompt | supportsSeed                | supportsReferenceImages | maxReferenceImages |
| ----------------------------------------- | ---------------------- | --------------------------- | ----------------------- | ------------------ |
| `flux-2-*` (bfl)                          | –                      | true                        | true                    | 4                  |
| `gpt-image-1` (openai)                    | –                      | – (SDK warns "unsupported") | true                    | 4                  |
| `imagen-4.0-generate-001` (google-vertex) | true                   | true                        | –                       | –                  |

Note the seed file (`packages/database/src/seed/index.ts`) lists
`flux-2-pro`, which no longer matches any row in the database.

## Schema (packages/database)

`aimodel.schema.ts` — fix the default (above) and extend the interface. All
new fields optional:

```ts
export interface AiModelCapabilities {
  canGenerateText?: boolean;
  canGenerateImage?: boolean;
  canGenerateVideo?: boolean;
  canGenerateAudio?: boolean;
  // Image-generation inputs. Absent means unsupported (fail closed).
  supportsNegativePrompt?: boolean;
  supportsSeed?: boolean;
  supportsReferenceImages?: boolean;
  maxReferenceImages?: number;
}
```

`genimage.schema.ts` — one new column. `seed` and `negativePrompt` already
exist and already round-trip.

```ts
export type GenImageReferenceOrigin = 'upload' | 'genImage';

export interface GenImageReference {
  origin: GenImageReferenceOrigin;
  storageKey: string;
}

referenceImages: jsonb('reference_images')
  .$type<GenImageReference[]>()
  .default([])
  .notNull(),
```

(Use `.default([])`, not `.default('[]')`, for the reason above.)

`ai-model.repo.ts` keeps `getAiModelById`; no new query helper is needed once
the body carries `aiModelId`.

## Storage (packages/storage)

`image-urls.ts` gains a sibling to `getImgGenBucketNameForUser`:

```ts
export function getImgRefBucketNameForUser(userId: string): { bucketName: string; prefix: string };
// → { bucketName: config.cfImagesBucketName, prefix: `${userId}/images/references` }
```

Same bucket and public domain, new prefix, exactly like
`getVideoGenBucketNameForUser`. `buildImageUrls` already works for any key,
so reference thumbnails reuse it.

## AI package (packages/ai)

`src/services/imagen.service.ts`:

- `generateImagesSchema` gains
  `referenceImages: z.array(z.object({ origin, storageKey })).max(4).optional()`.
  The service-level schema takes resolved storage keys; the HTTP-level
  discriminated union lives in the API package (same split as
  `validGenerateVideoBody`).
- `createGenImages` downloads each reference from R2 and switches the
  `generateImage` call from `prompt: string` to
  `prompt: { text: prompt, images: [...] }` when references are present.
  Keep the plain string form otherwise, so the non-reference path is
  byte-identical to today.
- Log `imageGenResult.warnings` when non-empty (decision 6).
- Persist `referenceImages` on every created `gen_images` row, alongside the
  `seed` and `negativePrompt` it already writes.
- `toGenImageDto` widens to carry the settings the preview dialog needs.

`src/tools/image-gen.tool.ts`: add optional `seed` and `negativePrompt` to
the flat `inputSchema`. The tool resolves its model via
`getDefaultAiModelByModality`, so it must drop both fields when that model's
capabilities do not allow them rather than erroring, since the agent cannot
see the capability flags.

## API (apps/api)

`validation/gen-image.schema.ts`:

```ts
const genImageReferenceSchema = z.discriminatedUnion('origin', [
  z.object({ origin: z.literal('genImage'), genImageId: z.uuidv7() }),
  z.object({ origin: z.literal('upload'), storageKey: z.string().min(1) }),
]);
```

Body becomes `generateImagesSchema.omit({ provider, model, referenceImages })
.extend({ aiModelId: z.uuidv7(), referenceImages: z.array(...).max(4).optional() })`.

`services/imagegen.service.ts`:

- Load the `ai_models` row by `aiModelId`; 404 if missing.
- Validate the request against `capabilities`, fail closed. A `negativePrompt`
  on a model without `supportsNegativePrompt`, a `seed` without
  `supportsSeed`, or references without `supportsReferenceImages` (or beyond
  `maxReferenceImages`) is a 400 naming the field and the model. This is the
  API-side half of the UI gating; the two must agree.
- `resolveReferenceImages()` mirrors `resolveFrame()` in
  `videogen.service.ts`: `upload` entries pass their storage key through,
  `genImage` entries are looked up with
  `getGenImageByIdAndWorkspaceId` so a caller cannot borrow another
  workspace's image. 404 per missing id.
- `toGenImageResponse` widens to include `aspectRatio`, `resolution`, `seed`,
  `negativePrompt`, `model`, `provider`, and `referenceImages` resolved to
  `{ origin, imgUrl }`, so the grid and preview dialog can render and reuse
  settings without a second request.

`controllers/imagegen.controller.ts` gains:

```
POST /workspace/:workspaceId/gen-image/reference-upload
```

Multipart, a single `file` field, PNG/JPEG/WEBP, 10 MB cap, returns
`{ storageKey }`. Copy the shape of `/gen-video/frame-upload`, including
`FRAME_EXTENSION_BY_MIME_TYPE` (rename to
`REFERENCE_EXTENSION_BY_MIME_TYPE`) and the byte cap.

## Web (apps/web)

`features/image/composables/useImageGenApi.ts`:

- `GenerateImagesBody` swaps `provider` + `model` for `aiModelId` and gains
  `negativePrompt`, `seed`, `referenceImages`.
- `GeneratedImage` gains the settings fields returned above.
- New `useUploadImageReference()` mutation, a copy of
  `useUploadVideoFrame()`.

`features/image/components/ImageGenForm.vue` moves from the `PromptInput`
composite to the `useForm` + `Collapsible` layout `VideoGenForm.vue` uses, so
the two generators read the same way:

- Prompt textarea, then a row of model / aspect ratio / resolution / count
  selects (`AiModelSelector` with `modality="image"`, replacing the local
  select).
- An "Advanced options" `Collapsible` holding negative prompt and seed. Each
  control is `:disabled` when the selected model's capability flag is unset,
  wrapped in a `Tooltip` explaining which model lacks it. Values are
  **not** cleared on switching models, only withheld from the request, so
  switching back does not lose typed text.
- A reference-images section, rendered only when
  `supportsReferenceImages` is set, and gated behind a `Switch` exactly like
  videogen's "Animate an image" toggle. The picker stays collapsed until the
  switch is on, so the workspace's image list does not sit under the prompt
  input permanently. Once open: gallery / upload `Tabs` like the frame
  picker, but multi-select up to `maxReferenceImages` (clamped to 4), with
  the count shown and further selection disabled at the cap.
  `resolveReferenceImages()` returns `undefined` while the switch is off,
  the same guard order as `resolveFrame()`, and a successful generation
  flips it back off. Toggling off does **not** clear the selection (again
  matching videogen), so switching it back on restores what was picked.

`features/image/stores/imagegensettings.store.ts` swaps `modelId` semantics
to the `ai_models` row id it already stores; no change needed beyond naming.
Negative prompt, seed and references stay in form state, not localStorage
(same as videogen).

`features/image/components/ImageGenPreviewDialog.vue` gains a settings block
(model, aspect ratio, resolution, seed, negative prompt, reference
thumbnails) and a "Reuse settings" button that writes them back into the
form store and the form, then closes the dialog. Fields the current model
cannot honour are dropped on reuse rather than silently sent.

i18n: extend the `imagen` block in `en-UK.json` and `de-DE.json`, reusing
`videogen.form.*` wording for the shared labels (`advancedOptions`,
`negativePrompt`, `seed`, upload buttons) so the two forms stay consistent.

## Open questions

- Should a "randomise seed" button sit next to the seed input? Videogen has
  none; adding it to both later would be more consistent than adding it here
  only.
- `n > 1` with a fixed seed produces `n` identical images on some providers.
  Worth a hint in the UI, or leave it to the user to discover.

## Known gap: "Reuse settings" does not restore references

The preview dialog's reuse action restores model, aspect ratio, resolution,
seed and negative prompt, but not the reference images. The response shape
deliberately exposes references as `{ origin, imgUrl }` only: an `upload`
entry's storage key is not sent to the client, and a `genImage` entry does
not carry the id of the row it came from, so neither can be resubmitted.

Fixing it means widening the response, which is a real decision rather than
an oversight: `storageKey` is an internal identifier that nothing else in
the client contract leaks, and echoing `genImageId` back is only useful if
the source row still exists. Left out until someone actually wants it.

## Known gap: orphaned reference uploads

`reference-upload` writes the object to R2 before the generation request is
submitted, so a user who picks a reference and then abandons the form leaves
an object under `<userId>/images/references/` that no `gen_images` row
points at. Nothing collects it.

This is inherited, not introduced: `/gen-video/frame-upload` has the same
behaviour for `<userId>/videos/frames/`, as does social-post media. Deliberately
left alone here so the two generators stay consistent; fixing it properly means
one mechanism for all three (a sweep of unreferenced keys older than N hours, or
deferring the upload until submit and sending the bytes with the generation
request). Out of scope for this change.
