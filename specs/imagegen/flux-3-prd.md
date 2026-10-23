# Image generation: FLUX 3 image model (PRD)

> **Status: decided** (2026-10-23). Replaces the BFL FLUX 1/2 image models with
> `flux-3-image`. No backward compatibility for the dropped models.
> `flux-3-image-klein` is not supported. Gemini (`google-vertex`),
> `gpt-image-1` (`openai`), Veo and `flux-3-video` are unchanged.

Black Forest Labs released the FLUX 3 image family. `@ai-sdk/black-forest-labs`
already supports it in the installed version (2.0.66). Our `bfl` branch in
`packages/ai/src/services/imagen.service.ts` only speaks the legacy FLUX 1/2
request shape, so a FLUX 3 row would generate, but silently ignore our 1K/2K
choice. This PRD drops the legacy models and wires `flux-3-image` properly.

## Goals

- `flux-3-image` selectable in `/text-to-image` and usable by the
  chat/workflow image tool.
- The 1K/2K resolution choice is honored.
- The `bfl` image branch has a single request style: tier + ratio, the same
  shape as the Gemini branch. The pixel map and the 1920 cap go away.
- The seed ships FLUX 3 instead of FLUX 2. Existing databases are updated by
  hand (see "Manual prod step").
- Stored files carry the real image format, not a hard-coded PNG.

## Non-goals

- No `flux-3-image-klein` or any other FLUX 3 variant.
- No change to `google-vertex`, `openai` or any video provider.
- No migration. The only existing install is the maintainer's prod instance,
  updated by hand. There are no self-hosters to carry along yet.
- No new resolutions. `imageGenResolutions` stays `1K | 2K`. (Both Gemini and
  `flux-3-image` support a 4K tier; adding it is a separate change.)
- No credit pricing. Imagegen is not credit-gated yet; the new row gets
  `pricing: null`, like the rows it replaces. The maintainer sets prices by
  hand later.
- No `grounding` toggle and no prompt-upsampling toggle.
- No change to how the default image model is picked (see Risks).

## Verified SDK facts (`@ai-sdk/black-forest-labs` 2.0.66, from `dist/index.js`)

The SDK routes by model id (`BlackForestLabsImageModel.modelApi`): FLUX 1/2
and kontext ids take a `legacy` request format, `flux-3-image` its own format,
and every other id the `latest` format (currently FLUX 3 Klein). Only
`flux-3-image` matters here.

**`flux-3-image`**

- Size: `aspectRatio` plus `providerOptions.blackForestLabs.resolution`, one of
  `'768sq' | '1k' | '1.5k' | '2k' | '4k'`. Width/height are ignored with a
  warning.
- Aspect ratios accepted: `21:9, 2:1, 16:9, 3:2, 7:5, 4:3, 5:4, 1:1, 4:5, 3:4,
  5:7, 2:3, 9:16, 1:2, 9:21`. Ours (`1:1, 4:3, 16:9`) are all covered.
- Supported provider options: `resolution`, `safetyTolerance` (0 to 7),
  `grounding`, `version`, poll settings. Everything else warns "unsupported".
- **No seed** (warns). No `outputFormat`. No negative prompt.
- Reference images: `prompt.images`, up to 10, sent as `images`.

**Output bytes.** The SDK returns raw bytes. The AI SDK's `generateImage`
sniffs the format and exposes it as `image.mediaType`. There is no
output-format option, so the bytes are not guaranteed to be PNG.

## Decisions

1. **Drop FLUX 1/2 without backward compatibility.** Old `gen_images` rows stay
   viewable: they store `provider` and `model` as text, not as an FK.
   `credit_usage.ai_model_id` is `ON DELETE SET NULL` and keeps its text
   columns. "Reuse settings" on an old image already falls back to the current
   model (`applyReusedSettings` in `ImageGenForm.vue`), and a stale
   localStorage `modelId` falls back to the first model. No web change needed.
2. **One `bfl` request style, no routing by model id.** Every `bfl` image model
   gets tier + ratio. The SDK's `latest` format also accepts `resolution` and
   `aspect_ratio`, so a future FLUX 3 id still gets a valid request.
3. **No unified adapter.** Split `configProviderParams` into three small named
   functions in `imagen.service.ts`. Keep the `switch (provider)` as a thin
   dispatcher. No interface, no registry.
4. **Seed only, no migration.** The seed fills an empty `ai_models` table, so
   it covers fresh installs. The one existing install (prod) is changed by hand
   with the SQL under "Manual prod step". No file under
   `packages/database/drizzle/`.
5. **Capabilities are set in the seed.** Earlier rows had capabilities set by
   hand. Here the values follow directly from the SDK facts above, so the seed
   writes them. Otherwise a fresh install would show every option as disabled.
6. **Use the real media type.** Upload key extension, `contentType`, the
   watermark `mimeType` and the media row's `mimeType` come from
   `image.mediaType`, not from a hard-coded `'image/png'`.

## Changes

### `packages/ai/src/services/imagen.service.ts`

Replace the inline `configProviderParams` switch with:

- `bflParams({ resolution, aspectRatio })`:
  - `aspectRatio`: passed through.
  - `seed`: `undefined`.
  - `providerOptions.blackForestLabs`: `{ resolution }`, mapping `'1K'` to
    `'1k'` and `'2K'` to `'2k'` via a small typed map.
- `vertexParams(...)` and `openAiParams(...)`: moved out unchanged.

Delete `ratiosResolutionMap`, `getDimensionsFromResolutionAndAspectRatio` and
the comment about the 1920 legacy cap. They are only used by the `bfl` branch.

Media type (decision 6): in `generateAndUploadBatch`, read `image.mediaType`
per image. Map it to a file extension (`image/png` to `png`, `image/jpeg` to
`jpg`, `image/webp` to `webp`). Pass it to `applyImageWatermark`, to
`uploadObjectBuffer`'s `contentType` and the key extension, and return it with
each upload so `runGenImages` sets the media row's `mimeType` from it. Throw on
a media type outside that list.

### `packages/database/src/seed/index.ts`

Replace the `flux-2-pro` entry with:

| Field          | `flux-3-image`                                                                     |
| -------------- | ---------------------------------------------------------------------------------- |
| `provider`     | `bfl`                                                                              |
| `modality`     | `image`                                                                            |
| `family`       | `diffusion`                                                                        |
| `size`         | `medium`                                                                           |
| `displayName`  | `FLUX 3`                                                                           |
| `description`  | `High-quality image generation by Black Forest Labs.`                              |
| `capabilities` | `{ canGenerateImage: true, supportsReferenceImages: true, maxReferenceImages: 4 }` |

Absent capability keys mean unsupported, so seed and negative prompt are off.
`maxReferenceImages` stays at our app-wide cap of 4 (`generateImagesSchema`),
not BFL's 10.

### Manual prod step (maintainer, not the agent)

After deploy, run once against prod. Insert first, so there is always a `bfl`
image model:

```sql
INSERT INTO "ai_models" ("id", "provider", "model", "modality", "family", "size", "display_name", "description", "capabilities", "meta", "created_at", "updated_at")
VALUES
  (uuidv7()::text, 'bfl', 'flux-3-image', 'image', 'diffusion', 'medium', 'FLUX 3',
   'High-quality image generation by Black Forest Labs.',
   '{"canGenerateImage": true, "supportsReferenceImages": true, "maxReferenceImages": 4}'::jsonb,
   '{}'::jsonb, now(), now())
ON CONFLICT ("provider", "model") DO NOTHING;

DELETE FROM "ai_models"
WHERE "provider" = 'bfl' AND "modality" = 'image' AND "model" <> 'flux-3-image';
```

The same SQL updates a local dev DB. Don't empty `ai_models` to re-seed:
`agents` and `agent_templates` reference it with `ON DELETE CASCADE`.

### Tests (test-first, load the tdd skill)

Worker suite, `apps/worker/test/generation/gen-images-processor.test.ts`,
asserting on the options `imageModelGenerateMock` receives:

- `bfl`, `2K`, `16:9`, seed set on the row: `providerOptions.blackForestLabs`
  is `{ resolution: '2k' }`, `aspectRatio` is `'16:9'`, `seed` is undefined,
  no `size`.
- `bfl`, `1K`: `resolution` is `'1k'`.
- Media type: the mock returns JPEG bytes. The stored object key ends in
  `.jpg` and the media row's `mimeType` is `image/jpeg`.

Move test fixtures off `flux-pro` (`apps/worker/test/support/generation-fixtures.ts`,
`apps/worker/test/smoke/ai-mocks.test.ts`, `apps/api/test/imagegen/gen-images.test.ts`)
to `flux-3-image`.

Run `pnpm test:worker`, `pnpm test:api` and `pnpm check-types`.

### Docs and specs (same PR)

- `specs/imagegen-known-issues.md`: remove the 1920 section. Keep the
  `disable_pup` section, noting it still applies (no `disable_pup` in 2.0.66).
  Update "Last checked".
- `specs/imagegen/prd.md`: one-line update note pointing here (its capability
  table lists `flux-2-*`).
- `apps/docs/src/content/docs/media/images.mdx`: drop "The long edge of a `2K`
  image is 1920 pixels". FLUX 3 picks the exact pixel size per tier. Note that
  FLUX 3 has no seed. Load the docs-writing skill.
- README, `specs/features.md`, `apps/docs/.../introduction.mdx`: "FLUX" stays
  correct; check, don't reword.
- On ship: Status to `implemented`, `specs/overview.md` entry, `pnpm specs:index`.

## Risks

- **Default image model may change.** `getDefaultAiModelByModality` uses
  `findFirst` without `orderBy`. Today that is usually the oldest image row,
  probably `flux-2-pro`. After the manual swap, the chat/workflow image tool may
  default to Gemini or `gpt-image-1` instead of FLUX 3. Accepted for now; a
  deterministic default is a separate change.
- **No seed for FLUX anymore.** FLUX 2 supported it; FLUX 3 does not. The form
  disables the field via capabilities, and the chat tool drops it silently.
- **Future self-hosters on an old DB** would keep FLUX 2 rows, which then get
  a tier request the legacy API doesn't understand. Not relevant today; if
  self-hosted installs exist before this ships, revisit decision 4.
- **Output format.** If BFL returns JPEG, gallery downloads and the watermark
  become JPEG. Decision 6 handles that correctly; the files are just not PNG.

## Slices

Two slices with no shared files. They run in parallel.

1. **Code** (`packages/ai`, `packages/database` seed, worker + api tests):
   everything under "Changes" except "Docs and specs" and "Manual prod step".
   Test-first. Rebuild touched packages with `pnpm --filter @repo/<pkg> build`.
2. **Docs** (`specs/imagegen-known-issues.md`, `specs/imagegen/prd.md`,
   `apps/docs/src/content/docs/media/images.mdx`): the "Docs and specs" list,
   except the on-ship bookkeeping (Status, `overview.md`, `specs:index`), which
   the team lead does after the user confirms.
