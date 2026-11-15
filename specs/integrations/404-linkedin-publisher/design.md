# Integrations: LinkedIn publishing on the shared connection layer (design)

Design for [prd.md](./prd.md). Issue #404.

## Package layout

`@repo/linkedin` is deleted. Its code moves into `@repo/integrations` under a new `./social` subpath.

```text
packages/integrations/src/
  http/vendors/linkedin.ts        LINKEDIN_API: base URL, error-code parser
  social/
    index.ts                      resolveUserLinkedin + public exports
    errors.ts                     SocialPublishError, SocialPublishErrorKind
    linkedin/
      linkedin.publisher.ts       LinkedinPublisher interface, private class, createLinkedinPublisher
      linkedin.client.ts          vendor client with LinkedIn headers, withLinkedinErrors
      linkedin.parse.ts           zod: upload registration, image status, post id header
      linkedin.types.ts           wire types, not exported from the package
```

File names say `publisher`, not `provider`: `providers/linkedin/linkedin.provider.ts` is the OAuth
provider, and in the glossary "provider" means the vendor.

## Publisher

```ts
export interface PublishImage {
  bytes: Buffer;
  mimeType: string;
  altText?: string;
}
export interface UploadedImage {
  id: string;
  altText?: string;
}
export interface PublishPostParams {
  text: string;
  images: UploadedImage[];
}
export interface PublishedPost {
  id: string;
  url: string;
}

export interface LinkedinPublisher {
  uploadImage(image: PublishImage): Promise<UploadedImage>;
  publishPost(params: PublishPostParams): Promise<PublishedPost>;
}

export interface LinkedinPublisherOptions {
  getAccessToken: () => Promise<string>;
  /** LinkedIn person id: the connection's `externalAccountId`. */
  authorId: string;
  sleep?: (ms: number) => Promise<void>;
}

export function createLinkedinPublisher(options: LinkedinPublisherOptions): LinkedinPublisher;
```

- A class implements the interface: it holds the vendor client, author id and sleep across
  methods. It is not exported; callers only see `LinkedinPublisher`.
- `uploadImage` registers the upload, PUTs the bytes and polls the image status. One image per
  call, so `apps/api` downloads and uploads one image at a time.
- `publishPost` builds the body (no `content`, `content.media`, or `content.multiImage`) as a
  module-level function and reads the post id from the `x-restli-id` header.
- Ids leave the package as opaque strings. The URN format stays inside.
- Polling counts attempts (`maxPolls = timeout / interval`) instead of reading the clock, so a test
  with a recorded `sleep` runs instantly.

## HTTP and retries

`LINKEDIN_API` is a `VendorApi` (`https://api.linkedin.com/rest`). The client sends
`LinkedIn-Version` and `X-Restli-Protocol-Version: 2.0.0` on every authorized request.

| Call                             | Method | Retry (after #403)                                     | Timeout |
| -------------------------------- | ------ | ------------------------------------------------------ | ------- |
| `images?action=initializeUpload` | POST   | `idempotent: true`: an orphan registration is harmless | default |
| upload URL                       | PUT    | default (full)                                         | 120 s   |
| `images/{urn}`                   | GET    | default (full)                                         | default |
| `posts`                          | POST   | default (429 only)                                     | default |

The upload URL is absolute and needs the bearer token (`requestRaw` with `authorize: true`).

`LINKEDIN_API_VERSION` moves to `http/vendors/linkedin.ts`. Check `202506` against LinkedIn's
version support window and bump it in this PR if needed.

## Errors

`SocialPublishError` with `kind: 'auth' | 'rate_limited' | 'media_failed' | 'rejected'`, mapped
once in `withLinkedinErrors` from `VendorApiError` (same pattern as `withDriveErrors`). Messages
carry status and step, never the vendor body, so `apps/api` can store them in `publishError`.

## Glue

```ts
type ResolvedLinkedin =
  | { status: 'not_connected' }
  | { status: 'needs_reauth'; connectionId: string }
  | { status: 'ready'; publisher: LinkedinPublisher; connection: IntegrationConnection };

export interface ResolveUserLinkedinParams {
  userId: string;
  sleep?: LinkedinPublisherOptions['sleep'];
}

export function resolveUserLinkedin(params: ResolveUserLinkedinParams): Promise<ResolvedLinkedin>;
```

Same steps as `resolveUserCloudDrive`: connection by provider, `needs_reauth` check,
`connectionServesIntegration(connection, getIntegration('linkedin-posting'))`, then a publisher
built with `createIntegrationTokenGetter`.

## Flagging a rejected connection

`token.service.ts` already flags a connection whose refresh fails (`flagNeedsReauth`: status
**Needs reconnect** plus an `integration_needs_reauth` notification, only on the first change).
Export it as `flagConnectionNeedsReauth({ connectionId, reason })` and `publishSocialPost` calls it on a
`SocialPublishError` of kind `auth`, reason `access_rejected`. Mail and cloud
drive get the same call in their own issue.

## apps/api

- `publishSocialPost`: `resolveUserLinkedin`. Anything but `ready` returns `linkedinNotConnected`.
  A `SocialPublishError` of kind `auth` (LinkedIn 401 only) flags the connection, returns
  `linkedinNotConnected` and leaves the post status unchanged. Other errors, a 403 included, mark
  the post **Failed** as today.
- `social-post-media.service.ts` keeps the R2 download and calls `publisher.uploadImage` per item.
- Inline parameter object types become named interfaces.

## Tests

- Delete `packages/testing/src/mocks/linkedin-provider.mock.ts`, its re-export in
  `provider-mocks.ts`, the `@repo/linkedin` mock in `apps/api/test/preload.ts`, and the mentions
  in `apps/api/test/README.md`, `packages/testing/README.md` and
  `apps/api/test/email/support/email-queue.mock.ts`.
- `packages/testing/src/social/vendors/linkedin.routes.ts` and `linkedin.fixture.ts`: happy-path
  routes for the four calls above. Fixtures are trimmed real response shapes.
- Add `api.linkedin.com` and the upload host (`www.linkedin.com`) to `VENDOR_HOSTS`.
- `packages/testing/src/social/linkedin-connection.ts`: `seedLinkedinConnection({ userId, status,
  integrationIds })` on top of `seedIntegrationConnection`.
- Tests pass `recordVendorSleep` through `resolveUserLinkedin({ sleep })`, like cloud drive.
- No contract suite: one vendor.

## Extension points

- **Axis:** social network. **Contract:** none yet; `LinkedinPublisher` is the only implementation.
- **Known variants:** LinkedIn only. No issue names a second network.
- **Adding the next one:** extract `SocialPublisher` from `LinkedinPublisher`, add a catalog entry
  in category `social`, a vendor folder under `social/`, a registry
  `Record<IntegrationIdIn<'social'>, Factory>`, and a contract suite from the existing LinkedIn
  scenarios. `apps/api` swaps `resolveUserLinkedin` for a resolver keyed by integration id.
- **Faked in tests:** vendor HTTP, in `packages/testing/src/vendor-http`.
- **Packages considered:** none. The shared vendor client covers it.
- **Not abstracted:** the registry and contract, for the reason above.

## Spec and docs bookkeeping

- `specs/architecture.md`: drop `linkedin/` from the package tree.
- `specs/linkedin-strategy.md`: point to `@repo/integrations/social` instead of `@repo/linkedin`.
- `apps/docs/src/content/docs/errors/linkedin-not-connected.mdx`: add the new causes.
- `apps/docs/src/content/docs/integrations/social-posts.mdx`: **Failed** row.
