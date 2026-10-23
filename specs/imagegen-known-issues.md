# Image generation: known issues

_Last checked: 2026-10-23._

Gaps in `@ai-sdk/black-forest-labs` (checked at v2.0.66) that limit what the `bfl` provider can send. Revisit when the package catches up.

## `prompt_upsampling` / `disable_pup` toggle not implemented

BFL's API takes `disable_pup: boolean` (default `false`) to opt out of automatic prompt upsampling. We wanted to expose this as a unified "prompt upsampling" switch in the image-gen UI (default off → `disable_pup: true`), wired for `bfl` only and stubbed for other providers.

**Why not done:** SDK 2.0.66 still has no `disable_pup` option. The options schema is a plain `z.object(...)` without `.passthrough()`, so any extra field added to `providerOptions.blackForestLabs` (e.g. a raw `disable_pup` key) is silently stripped by `parseProviderOptions` before the request body is built. For `flux-3-image` the schema is stricter still: it only accepts `resolution`, `safetyTolerance`, `grounding`, `version` and poll options, so `promptUpsampling` is not even forwarded.

**How to apply:** the only clean way to send `disable_pup` today is to bypass the SDK's body-building for the `bfl` provider, e.g. a custom `fetch` passed into `createBlackForestLabs(...)` that rewrites the outgoing submit POST (or drop the SDK's image model for `bfl` in favor of a direct REST call). Decided to defer that until it's actually needed rather than build the shim speculatively. Don't add a "prompt upsampling" UI control until the backend can actually honor it. A no-op toggle would be misleading.
