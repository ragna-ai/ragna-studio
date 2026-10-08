# Local storage driver

Status: deferred (2026-10-07). The current storage helpers need a cleanup before a second driver fits; the quickstart keeps S3 for now.

## Problem

Storage is S3 only. Trying RAGNA Studio on a laptop needs a bucket at R2, AWS or a self-run S3 server
before the app starts. That is the second-biggest hurdle in the quickstart after the OAuth app.

Bundling an S3 server isn't a good answer. MinIO's community edition is archived. The alternatives
(SeaweedFS, RustFS, Garage) each add a container, a bootstrap step for buckets and public reads, and
another project to track.

## Goals

- A local or single-VM instance runs without any S3 service. Files live in a folder on a Docker volume.
- S3 stays the default. ragna.io production doesn't change.
- No caller outside `@repo/storage` changes.

## Non-goals

- **Multi-node deployments.** The folder is local to one host. Kubernetes and multiple backend hosts use S3.
- **Migrating data between drivers.** See "Switching drivers" for what is possible by hand.
- **A CDN or image resizing** in front of local files.
- **Quotas and disk-full handling** beyond what the OS returns.

## Today

All S3 access goes through `packages/storage/src/services/bucket.service.ts`. It creates an `s3mini`
client per call (`lib/s3-client.ts`, path-style `${S3_ENDPOINT}/${bucket}`).

Functions with callers outside the package:

| Function               | Callers                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `uploadObjectBuffer`   | `@repo/media` (`storeMedia`), `@repo/ai` (imagen, videogen), `social-post.service.ts`        |
| `downloadObjectBuffer` | chat, email, media, social-post-media services, `@repo/ai`, worker's agent-context processor |
| `deleteObjects`        | `@repo/media`, `media.service.ts`                                                            |
| `getObjectStat`        | `@repo/media`                                                                                |

`listObjects`, `deleteAllObjects`, `uploadObject` and `downloadObject` have no callers outside the package.

Public reads: the browser loads images and videos from `MEDIA_URL/<key>` (`toPublicMediaUrl`). That URL
points at the images bucket, which is public-read. The documents bucket is private and only read through
authenticated API routes.

AI providers never get a media URL. Every caller downloads the bytes and passes them on. So local
URLs like `http://localhost:3010/media/...` don't break any AI feature.

## Design

### Config

| Var                  | Default         | Meaning                            |
| -------------------- | --------------- | ---------------------------------- |
| `STORAGE_DRIVER`     | `s3`            | `s3` or `local`                    |
| `STORAGE_LOCAL_PATH` | `/data/storage` | Root folder for the `local` driver |

With `local`:

- `S3_ENDPOINT` and the S3 keys are not needed.
- `S3_IMAGES_BUCKET_NAME` and `S3_DOCUMENTS_BUCKET_NAME` are still used, as folder names. Media rows store
  the bucket name (`media.bucket`), so the names must stay stable. Defaults: `images` and `documents`.
- `MEDIA_URL` and `NUXT_PUBLIC_MEDIA_URL` point at the backend: `http://localhost:3010/media`.
  The existing CSP plugin (`apps/web/server/plugins/csp-origins.ts`) picks this up without changes.

### Driver shape

`bucket.service.ts` keeps its exported functions and signatures. Each one picks the driver from config:

```
packages/storage/src/
  drivers/
    s3.driver.ts      # today's s3mini code, moved
    local.driver.ts   # node:fs/promises
  services/bucket.service.ts  # validates input, delegates to the configured driver
```

Both drivers implement one interface with the operations the public functions need:
`put`, `get`, `stat`, `delete`, `list`.

- `local.driver.ts` uses `node:fs/promises` only. The API runs on Bun, the worker on Node.
- The four public functions without callers are removed instead of ported. That keeps the interface small.

### On-disk layout

```
/data/storage/<bucket>/<key>              # object bytes
/data/storage/<bucket>/<key>.meta.json    # { "contentType": "image/png" }
```

- The sidecar file exists because keys don't always carry an extension. Chat uploads
  (`<owner>/images/chat-uploads/<mediaId>`) and documents (`<owner>/media/<mediaId>`) have none.
  `downloadObjectBuffer` returns the content type, and `social-post-media.service.ts` uses it for LinkedIn.
- Writes go to a temp file in the same folder, then `rename`. A crash never leaves a half-written object.
  The sidecar is written first, so an object never exists without its content type.
- `delete` removes both files and treats a missing file as deleted, like S3.
- `list` isn't needed by any caller once the unused functions are removed. It stays out.

### Key safety

Keys come from our own code today, but the driver doesn't rely on that:

- Resolve `<root>/<bucket>/<key>` and reject it unless it stays inside `<root>/<bucket>`.
- Reject empty keys, absolute keys, `..` segments, NUL bytes and keys ending in `.meta.json`.

### Serving public media

A new route in `apps/api` serves the images bucket folder, only when `STORAGE_DRIVER=local`:

```
GET /media/*   ->  <root>/<images bucket>/<key>
```

- **No auth**, same as today's public-read bucket. The documents bucket is never served.
- **Range requests** (`206 Partial Content`). Videos need them for seeking.
- `Content-Type` from the sidecar. `Cache-Control: public, max-age=31536000, immutable`, since keys contain
  UUIDs and objects are never overwritten.
- These files are user content served from the API origin, which holds the session cookie. Defensive
  headers stop a crafted file from running as a page there: `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`, and `Cross-Origin-Resource-Policy: cross-origin`
  so `localhost:3000` may still embed it. Uploads are already limited to png, jpeg and webp (`IMAGE_KINDS`).
- `404` for missing objects. No directory listings.

### Docker

- A named volume `storage` mounted at `/data/storage` in `backend` and `worker`. The worker writes too
  (agent context documents, image and video generation).
- Both images run as UID 1000 (`bun` in the API image, `node` in the worker image). The volume must be
  writable by that user.
- Compose changes go into the self-host override, not the base file. ragna.io doesn't use them.

### Switching drivers

Rows store `bucket` and `storageKey`, and the folder layout mirrors S3 (`<bucket>/<key>`). Moving from
`local` to S3 is a sync of both folders, for example with `rclone`, excluding `*.meta.json`. Content types
must be set on upload, which plain sync tools don't do from sidecar files. The docs mention this. A
migration tool is out of scope.

## Testing

TDD. `@repo/storage` has no tests today, and `@repo/testing` mocks it at the package boundary for
`apps/api` and `apps/worker` (`storage-provider.mock.ts`). That mock stays as it is.

New tests:

- **`local.driver.ts`**, against a temp folder: put then get returns the bytes and content type;
  stat on an existing and a missing key; delete removes both files and ignores missing keys;
  traversal keys (`../x`, `/etc/passwd`, `a/../../x`, `x.meta.json`) are rejected.
- **`GET /media/*`** in `apps/api/test/`: serves an image with the stored content type and the
  security headers; answers a Range request with `206`; returns `404` for a missing key, for `..`
  and for documents-bucket keys; doesn't exist when `STORAGE_DRIVER=s3`.

## Docs

- `self-hosting/storage.mdx` gets a "Local folder" tab next to R2 and AWS, with the multi-node limit.
- `reference/environment-variables` lists `STORAGE_DRIVER` and `STORAGE_LOCAL_PATH`.
- The quickstart uses the local driver once the install script exists.

## Open questions

| Question                           | Notes                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder name defaults               | `images` and `documents` when the `S3_*_BUCKET_NAME` vars are empty, or require them?                                                          |
| Rename the bucket-name vars        | `S3_IMAGES_BUCKET_NAME` reads oddly for a folder. A rename needs a migration path for existing `.env` files. Proposal: keep the names for now. |
| Removing the four unused functions | Belongs here because it shrinks the driver interface. Could also be its own small PR first.                                                    |
