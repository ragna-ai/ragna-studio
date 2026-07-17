# Image generation: known issues

_Last checked: 2026-07-17._

Deviations from BFL's documented FLUX.2 API, forced by gaps in `@ai-sdk/black-forest-labs` (checked at v2.0.10 and v2.0.11, the latest as of this writing). Revisit when the package catches up.

## 2K width/height capped at 1920px instead of BFL's native 2048

`packages/ai/src/services/imagen.service.ts`'s `ratiosResolutionMap` caps the long edge of the `2K` resolution at 1920px (1920x1920, 1920x1440, 1920x1080) instead of the originally intended 2048px.

**Why:** `@ai-sdk/black-forest-labs`'s `blackForestLabsImageModelOptionsSchema` hardcodes `width`/`height` to `z.number().int().min(256).max(1920)`, a limit from the older FLUX.1.x/kontext API. It applies regardless of model id, so it also constrains `flux-2-pro`/`flux-2-max`, whose real API (per [BFL's FLUX.2 docs](https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bmax%5D.md)) only enforces a 64px minimum and an "up to 4MP" output cap, not a 1920px-per-axis limit. Sending `width: 2048` (the original 2K value) fails client-side with a Zod `too_big` error before the request ever reaches BFL — this was the "too big" error reported against 2K generations.

**How to apply:** don't reintroduce 2048px (or anything above 1920px per axis) for the `bfl` provider until the SDK's schema is updated, or until we bypass its request-building (see below). Other providers (`google-vertex`, `openai`) aren't affected by this cap; only the shared `ratiosResolutionMap` couples them to the same numbers today.

## `prompt_upsampling` / `disable_pup` toggle not implemented

FLUX.2's real API takes `disable_pup: boolean` (default `false`) to opt out of BFL's automatic prompt upsampling for `flux-2-pro`/`flux-2-max`. We wanted to expose this as a unified "prompt upsampling" switch in the image-gen UI (default off → `disable_pup: true`), wired for `bfl` only and stubbed for other providers.

**Why not done:** `@ai-sdk/black-forest-labs`'s options schema only has `promptUpsampling` (maps to the legacy `prompt_upsampling` field), no `disable_pup`. The schema is a plain `z.object(...)` without `.passthrough()`, so any extra field added to `providerOptions.blackForestLabs` (e.g. a raw `disable_pup` key) is silently stripped by `parseProviderOptions` before the request body is built — there's no way to get it through as-is.

**How to apply:** the only clean way to send `disable_pup` today is to bypass the SDK's body-building for the `bfl` provider, e.g. a custom `fetch` passed into `createBlackForestLabs(...)` that intercepts the outgoing submit POST and rewrites `prompt_upsampling` → `disable_pup` (or drops the SDK's image model entirely for `bfl` in favor of a direct REST call). Decided to defer that until it's actually needed rather than build the shim speculatively. Don't add a "prompt upsampling" UI control until the backend can actually honor it — a no-op toggle would be misleading.
