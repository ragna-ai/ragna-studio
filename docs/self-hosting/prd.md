# Self-hosting: run ragna-studio outside ragna.io

**Status: in-progress** (2026-10-06). Replaces the localhost-only [self-hosting.md](../self-hosting.md).

## Problem

The repo is public and the README calls the product "self-hosted". In
practice, a self-hosted instance is broken in visible ways:

1. **Media URLs point at ragna.io.** `toPublicMediaUrl` in
   `packages/storage/src/lib/image-urls.ts` hardcodes
   `https://images.ragna.io/${key}`. A self-hoster's images and videos land
   in *their* bucket, but every URL points at *our* CDN. Nothing renders.
2. **Storage is Cloudflare R2 only.** `createS3Client` builds the endpoint as
   `https://<accountId>.r2.cloudflarestorage.com`. MinIO, AWS S3, Hetzner
   and others can't be used. Even trying it on localhost needs a Cloudflare
   account.
3. **The frontend defaults to ragna.io.** `apps/web/nuxt.config.ts`
   hardcodes `api.ragna.io`, `images.ragna.io` and `static.ragna.io` in the
   CSP, `static.ragna.io` in a dead `@nuxt/image` block, and
   `https://ragna.io` as the i18n `baseUrl`. The CSP can be overridden per
   directive through env, but a self-hoster has to know that and get four
   values exactly right.
4. **No setup for a real server.** The base `docker-compose.yml` publishes
   no ports. The dev override is built for localhost (`restart: no`, all
   ports public). `.env.example` points `DB_HOST`/`REDIS_HOST` at
   `localhost`, which is wrong inside the compose network.
5. **No native images for Apple Silicon.** `release.yml` builds
   `linux/amd64` only. On a Mac, every container runs under emulation,
   which is slow, and worst for the webbrowser's Chromium.

The current `self-hosting.md` only covers `make up-dev-full` on localhost.

## Targets

| Target | Who | Notes |
| --- | --- | --- |
| Linux VM | Anyone with a server and a domain | Docker Compose, own reverse proxy with TLS |
| Localhost | Trying it out, including Macs | Docker Compose, any S3-compatible storage the user runs or rents |

## Goals

- A fresh Linux VM with two DNS records gets a working instance by
  following one doc. No ragna.io domain is involved.
- Any S3-compatible storage works (R2, AWS, MinIO, others) through one set
  of `S3_*` env vars.
- Apple Silicon runs native images.
- The current production deploy keeps working, with a documented migration
  step.

## Non-goals

- **Kubernetes, Azure, or any managed container platform.** Our own k3s
  setup lives in the private infra repo.
- **Shipping a reverse proxy.** We don't maintain Caddy or Traefik config.
  The doc shows a Caddyfile example to copy.
- **Backups.** Operators own their backups. The doc says which state exists
  (Postgres, Redis, both buckets) and stops there.
- **Single-domain layout** (`example.com/api`). The API serves `/auth` and
  all routes at its root. Only the two-subdomain layout (`app.` + `api.`) is
  supported and documented.
- **Stripe and credits.** Off by default; the doc mentions it in one line.
- **Pinned image versions.** Compose keeps `:latest`.

## Design

### 1. Generic S3 storage, `CF_*` renamed to `S3_*`

The storage env vars are renamed now, so self-hosters never configure a
MinIO or AWS bucket through `CF_*` names:

| Old | New | Notes |
| --- | --- | --- |
| `CF_ACCOUNT_ID` + `CF_REGION` | `S3_ENDPOINT` | Full endpoint URL. Required. Both old values become part of the hostname. |
| (none) | `S3_REGION` | New. Signing region, passed to s3mini. Optional, default `auto`. |
| `CF_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID` | |
| `CF_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY` | Secret, read via `getSecret`. |
| `CF_IMAGES_BUCKET_NAME` | `S3_IMAGES_BUCKET_NAME` | |
| `CF_DOCUMENTS_BUCKET_NAME` | `S3_DOCUMENTS_BUCKET_NAME` | |

`CF_REGION` is not renamed to `S3_REGION`. The two mean different things:

- `CF_REGION` is the R2 jurisdiction (`eu`). Today it only goes into the
  hostname and is never used for signing.
- `S3_REGION` is the SigV4 signing region. R2 expects `auto`. AWS needs the
  bucket's real region (for example `eu-central-1`). Copying `eu` into
  `S3_REGION` would break every R2 request.

`createS3Client` uses `${S3_ENDPOINT}/${bucketName}` (path-style, which
MinIO, AWS and R2 all accept) and passes `S3_REGION` to s3mini. The R2
special case (account id plus jurisdiction host segment) goes away. An R2
install sets `S3_ENDPOINT=https://<account-id>.<jurisdiction>.r2.cloudflarestorage.com`
(the jurisdiction segment only for buckets in a jurisdiction, such as
`eu`) and leaves `S3_REGION` unset.

There is no fallback to the old names in code. `config` getters are renamed
to match (`s3ImagesBucketName`, and so on).

**Migration:** production sets the new `S3_*` vars next to the old `CF_*`
ones before this release deploys, and drops the `CF_*` ones afterwards. That
way the old and the new release both find their vars. The release notes
carry the mapping table above.

### 2. Configurable public media URL

New env var `MEDIA_URL`, the public base URL of the images bucket
(for example `https://images.example.com` or
`http://localhost:9000/ragna-images`).

- `toPublicMediaUrl` returns `${MEDIA_URL}/${key}`. It stays the
  single source of truth for media URLs.
- There is no ragna.io default. It would silently point every self-hosted
  instance at our CDN again.
- When it is missing, backend and worker log a warning at startup that
  names the variable, and keep running. Media URLs are then built without a
  host and don't render. Everything else works.
- **Migration:** production sets `MEDIA_URL=https://images.ragna.io`
  before this release deploys.

### Production config

Public values go in `ragna-infra/ragna/config.env` (the `ragna-config`
ConfigMap for backend and worker). The frontend doesn't read that ConfigMap;
its public env sits inline in `ragna-infra/ragna/frontend.yaml`. Secrets
(`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_ENDPOINT` because it
contains the account id) go in `env.sealedsecret.yaml` via `seal-env.sh`.

The images bucket must allow public reads. The documents bucket stays
private, as today.

### 3. Drop the broken `rawUrl`

`buildImageUrls` and `buildVideoUrls` return a `rawUrl` of the form
`https://<bucket>.<userId>.r2.cloudflarestorage.com/<key>`. That host doesn't
exist (the user id is not an R2 account id), and the web app never reads
the field. Remove it from both helpers and from the gen-image response. The
field is optional in the response type, so clients that ignore it are
unaffected.

### 4. Frontend CSP from runtime config

The frontend image is built once and must work on any domain, so the CSP
can't be fixed at build time.

- Remove the ragna.io hosts from `nuxt.config.ts`. Defaults become `'self'`
  plus `data:`/`blob:` where needed.
- A small Nitro plugin adds the two runtime origins to the CSP:
  `NUXT_PUBLIC_API_BASE_URL` (as `https://` and `wss://`, or `http://` and
  `ws://` on localhost) for `connect-src`, and `NUXT_PUBLIC_MEDIA_URL`
  for `img-src` and `media-src`.
- The per-directive `NUXT_SECURITY_HEADERS_CONTENT_SECURITY_POLICY_*`
  overrides in `.env.example` and the dev compose go away.
- Delete the dead `@nuxt/image` `cloudflare` block. Make the i18n `baseUrl`
  come from runtime config (`APP_URL`).

The frontend container gets one more non-secret env var
(`NUXT_PUBLIC_MEDIA_URL`), in line with PR #60's least-privilege env.

### 5. Self-host compose override

New `docker/docker-compose.selfhost.yml`, used on top of the base file:

- Publishes frontend and backend on `127.0.0.1` only (ports 3000 and 3010),
  for a reverse proxy on the same host. Postgres, Redis and the webbrowser
  stay unpublished.
- Sets the in-network hosts (`DB_HOST=postgres`, `REDIS_HOST=redis`,
  `WEBBROWSER_BASE_URL=http://webbrowser:3011`), so `.env` doesn't have to.
- Keeps `restart: always` from the base file.

New Makefile targets `up` and `down` wrap
`docker compose -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml`.

This is deliberately not the production compose we deleted in `afae45d`.
That one carried our Traefik setup. This one contains no proxy and nothing
specific to ragna.io.

### 6. Multi-arch images

`release.yml` builds `linux/amd64` and `linux/arm64` for all five images.
All base images (`node`, `oven/bun:debian`, Debian `chromium`, Debian
`ffmpeg`) are multi-arch already. arm64 builds run on GitHub's native arm64
runners (`ubuntu-24.04-arm`), one job per platform, merged into one
manifest. QEMU emulation would be simpler but much slower to build.

### 7. Rewrite `docs/self-hosting.md`

Written last, against the finished setup. It is also the source for the
planned Starlight docs. Sections:

1. **Requirements:** one Linux VM with Docker Compose, about 8 GB RAM (the
   compose memory limits add up to about 6.4 GB), two DNS records, an
   S3-compatible bucket pair, one OAuth app, one LLM key.
2. **Domains:** `app.example.com` and `api.example.com`, `COOKIE_DOMAIN`,
   `TRUSTED_ORIGINS`, `APP_URL`/`API_BASE_URL`/`NUXT_PUBLIC_API_BASE_URL`.
3. **Secrets:** generating them with `openssl rand`. Warning:
   `ENCRYPTION_PASSWORD` must never change, or stored secrets become
   unreadable.
4. **Storage:** two buckets, public read on images only, `S3_ENDPOINT`,
   `S3_REGION`, `MEDIA_URL`. Example values for R2 and AWS. For localhost,
   one paragraph: any S3-compatible server works, running it is up to the
   user. We don't ship or support one.
5. **OAuth:** the redirect URI per provider
   (`https://api.example.com/auth/callback/<provider>`).
6. **Start:** `make up`, what `migrate` and `seed` do.
7. **Reverse proxy:** a Caddyfile example with automatic TLS, including the
   WebSocket upgrade for the API.
8. **Restricting sign-up:** `ALLOWED_LOGIN_EMAILS`.
9. **Upgrades:** pull and start again. Migrations run automatically and only
   go forward.
10. **Optional providers:** today's list, plus SMTP (only the verify and
    welcome emails need it) and one line on Stripe/credits.
11. **Localhost and Mac:** the dev compose, no proxy, no TLS, storage as in 4.

## Rollout

1. `S3_*` rename, `MEDIA_URL`, `rawUrl` removal (1 to 3). Set the
   new vars in production before this deploys, drop `CF_*` after.
2. Frontend CSP (4).
3. Compose override and Makefile targets (5).
4. Multi-arch release (6). Independent of the rest.
5. Rewrite `self-hosting.md` and test it on a fresh VM (7).

## Open questions

1. **Image bucket naming.** Gen-image and gen-video inputs live under a
   `chat-uploads/` prefix (`buildChatUploadImageUrls`). Out of scope here,
   but a self-hoster browsing the bucket will see it.
