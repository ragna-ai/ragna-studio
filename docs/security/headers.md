# Security response headers

> **Status: implemented** (2026-09-21).

`app.ragna.io` and `api.ragna.io` both sit behind Traefik (see
`docker-compose.production.yml` + the operator's `dynamic_conf.yml`, the
latter isn't in this repo). Response headers are split across two owners:

- **Traefik** (`default-security-headers` in `dynamic_conf.yml`, applied via
  the shared `default@file` chain to both routers): `Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`. Identical
  for both apps, survives independently of app-level bugs.
- **`nuxt-security`** (`apps/web/nuxt.config.ts`, `apps/web` only): everything
  else, principally `Content-Security-Policy`.

## Why CSP lives in the app, not Traefik

`Content-Security-Policy` is a single header, if two layers both set it,
whichever sets it last wins outright, they don't merge. A static CSP
string in Traefik broke production on first rollout: Nitro injects two
inline `<script>` tags into every response (an `importmap` and the
`window.__NUXT__.config=...` payload), and a `script-src 'self'` with no
`'unsafe-inline'`/nonce/hash blocks both.

`app.ragna.io` is `ssr: false`, but Nitro still renders the HTML shell
per-request (`defineRenderHandler` / `getSPARenderer`, confirmed via
`.output/server/chunks/routes/renderer.mjs`), it's not a prebuilt static
`index.html`. That means a per-request CSP nonce is possible, and only the
process doing that per-request render (the app) can generate and stamp it
into both the header and the inline scripts at once. So CSP has to be
app-owned. Traefik's static config has no way to do this.

`ragna-api` doesn't run `nuxt-security` (it's not a Nuxt app) and doesn't
need CSP (it returns JSON, browsers don't enforce CSP against non-document
responses), so it stays on plain `default@file` with no change.

## What's configured

`security.headers.contentSecurityPolicy` in `apps/web/nuxt.config.ts`
overrides only what's app-specific; everything else is the module's secure
default (see `node_modules/nuxt-security/dist/defaultConfig.mjs`):

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | catch-all for directives not explicitly listed (`worker-src`, `manifest-src`, `media-src`, ...) |
| `connect-src` | `'self' https://api.ragna.io wss://api.ragna.io` | XHR/fetch/WebSocket to the API + live features (`useWebSocketChannel.ts`) |
| `img-src` | `'self' data: blob: https://static.ragna.io https://images.ragna.io` | `blob:` is needed for local upload previews (`URL.createObjectURL` in chat/task attachments and image/video gen forms); `images.ragna.io` is the real R2 media domain (`packages/storage/src/lib/image-urls.ts`); `static.ragna.io` is currently unused dead weight, left over from the commented-out `image.cloudflare` provider config below |
| `media-src` | `'self' https://images.ragna.io` | generated videos (`<video>`) come from the same R2 domain/bucket as images (`video-urls.ts` -> `getPublicMediaUrl`); this is a separate directive from `img-src`, not covered by it |
| `font-src` | `'self'` | `@nuxt/fonts` self-hosts Google Fonts at build time, no external font host is ever called |
| `style-src` | `'self' 'unsafe-inline'` | no external style host needed |
| `script-src` | `'self' https: 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' 'nonce-{{nonce}}'` | module default plus `'unsafe-eval'`: `vue-i18n` falls back to its JIT (`new Function`) message compiler for any `t(\`...${dynamicKey}\`)` call, since the key can't be statically precompiled at build time; that pattern is used throughout the app (workflow/task/dataset status labels, social providers, etc.), rewriting all of them wasn't judged worth it, `'unsafe-eval'`'s residual risk is narrow since `strict-dynamic`/nonce already gate which `<script>` tags can run at all. The nonce + `'strict-dynamic'` are what modern browsers actually honor; `'unsafe-inline'`/`https:`/`'self'` are CSP2 fallback for browsers that ignore nonces, unused otherwise |
| `frame-ancestors`, `base-uri`, `form-action`, `object-src`, `script-src-attr` | module defaults (`'self'`, `'none'`, `'self'`, `'none'`, `'none'`) | not overridden, already correct |

`referrerPolicy` (`no-referrer`) and `permissionsPolicy` (camera/mic/geo/
display-capture/fullscreen all denied) are also module defaults, not
overridden, both meet or exceed what we'd have hand-written.

`headers.strictTransportSecurity` / `xContentTypeOptions` / `xFrameOptions` /
`xXSSProtection` are set to `false` in the module config, disabled so they
don't fight Traefik's copies (last-write-wins would otherwise make the
outcome depend on middleware order, which isn't worth relying on).

`headers.crossOriginEmbedderPolicy` is also `false`: `static.ragna.io`
(Cloudflare R2) doesn't send a `Cross-Origin-Resource-Policy` header, and
COEP would block image loads from it.

## What's disabled entirely, and why

`apps/web` has no `server/` directory, every data call goes cross-origin to
`apps/api`. So `nuxt-security`'s request-time middlewares
(`rateLimiter`, `requestSizeLimiter`, `xssValidator`, `corsHandler`,
`allowedMethodsRestricter`, `csrf`) have no local API routes to protect and
are disabled. `sri` (Subresource Integrity) is also off for now, not
because it's wrong, just not verified yet; revisit separately if wanted.

The whole module is disabled in local dev (`security.enabled: !isDev`) so
CSP violations from the dev server (HMR, devtools) don't need constant
allow-listing.

## Maintenance

Adding a new external domain the frontend needs to call/load from (new CDN,
new API host, a third-party embed) means updating
`security.headers.contentSecurityPolicy` in `apps/web/nuxt.config.ts`.
There's no report-only staging step currently, a missed domain shows up as a
browser console CSP violation, not a build-time error.
