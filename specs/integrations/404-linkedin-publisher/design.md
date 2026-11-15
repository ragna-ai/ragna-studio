# Integrations: LinkedIn publishing on the shared connection layer (design)

Design for [prd.md](./prd.md). Issue #404.

## Package layout

`@repo/linkedin` is deleted. Its code moves into `@repo/integrations` under a new `./social` subpath.

```text
packages/integrations/src/
  http/vendors/linkedin.ts        LINKEDIN_API, LINKEDIN_API_VERSION, error-code parser
  social/
    index.ts                      resolveUserLinkedinPublisher + public exports
    errors.ts                     LinkedinPublishError, LinkedinPublishErrorKind
    linkedin/
      linkedin.publisher.ts       LinkedinPublisher interface, private class, createLinkedinPublisher
      linkedin.client.ts          vendor client with LinkedIn headers, withLinkedinErrors
      linkedin.parse.ts           zod: upload registration, image status, post id header
      linkedin.types.ts           wire types, not exported from the package
```

File names say `publisher`, not `provider`: `providers/linkedin/linkedin.provider.ts` is the OAuth
provider, and in the glossary "provider" means the vendor.

## Naming

Follows the sibling packages: every exported type carries the domain prefix, method parameters are
`<Verb><Domain><Noun>Params`, factory options are `<Thing>Options`, the resolver mirrors
`resolveUserCloudDrive`. Identifiers write `Linkedin`, like `LinkedinNotConnectedException` and
`linkedinProvider`. Prose writes `LinkedIn`.

## Publisher

```ts
export interface UploadLinkedinImageParams {
  bytes: Buffer;
  mimeType: string;
  altText?: string;
}
export interface LinkedinImage {
  /** Opaque. Only valid with the connection it came from. */
  id: string;
  altText?: string;
}
export interface PublishLinkedinPostParams {
  text: string;
  images: LinkedinImage[];
}
export interface LinkedinPost {
  /** Opaque. */
  id: string;
  url: string;
}

export interface LinkedinPublisher {
  uploadImage(params: UploadLinkedinImageParams): Promise<LinkedinImage>;
  publishPost(params: PublishLinkedinPostParams): Promise<LinkedinPost>;
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
- Internal wire types follow the Gmail and Drive pattern: `LinkedinImageUploadResponse`,
  `LinkedinImageResource`.

## HTTP and retries

`LINKEDIN_API` is a `VendorApi` (`https://api.linkedin.com/rest`), like `MICROSOFT_GRAPH_API`. The
client sends `LinkedIn-Version` and `X-Restli-Protocol-Version: 2.0.0` on every authorized request.

| Call                             | Method | Retry (after #403)                                     | Timeout |
| -------------------------------- | ------ | ------------------------------------------------------ | ------- |
| `images?action=initializeUpload` | POST   | `idempotent: true`: an orphan registration is harmless | default |
| upload URL                       | PUT    | default (full)                                         | 120 s   |
| `images/{urn}`                   | GET    | default (full)                                         | default |
| `posts`                          | POST   | default (429 only)                                     | default |

The upload URL is absolute and needs the bearer token (`requestRaw` with `authorize: true`).

Check `LINKEDIN_API_VERSION` (`202506`) against LinkedIn's version support window and bump it in
this PR if needed.

## Errors

`LinkedinPublishError` with `kind: LinkedinPublishErrorKind`:

```ts
export type LinkedinPublishErrorKind = 'auth' | 'rate_limited' | 'image_failed' | 'rejected';
```

- `auth`: LinkedIn answered 401.
- `rate_limited`: 429 after the shared client's retries.
- `image_failed`: LinkedIn reported the image as failed, or it was not ready within the poll limit.
- `rejected`: any other 4xx or 5xx, a 403 included.

Mapped once in `withLinkedinErrors` from `VendorApiError`, same pattern as `withDriveErrors`.
Messages carry status and step, never the vendor body, so `apps/api` can store them in
`publishError`.

## Glue

```ts
export type ResolvedLinkedinPublisher =
  | { status: 'not_connected' }
  | { status: 'needs_reauth'; connectionId: string }
  | { status: 'ready'; publisher: LinkedinPublisher; connection: IntegrationConnection };

export interface ResolveUserLinkedinPublisherParams {
  userId: string;
  sleep?: LinkedinPublisherOptions['sleep'];
}

export function resolveUserLinkedinPublisher(
  params: ResolveUserLinkedinPublisherParams,
): Promise<ResolvedLinkedinPublisher>;
```

Same steps as `resolveUserCloudDrive`: connection by provider, `needs_reauth` check,
`connectionServesIntegration(connection, getIntegration('linkedin-posting'))`, then a publisher
built with `createIntegrationTokenGetter`.

## Flagging a rejected connection

`token.service.ts` already flags a connection whose refresh fails (private `flagNeedsReauth`:
status **Needs reconnect** plus an `integration_needs_reauth` notification, only on the first
change). Export it as `flagConnectionNeedsReauth({ connectionId, reason })`. Its docstring says how
it differs from `markConnectionNeedsReauth` in `@repo/database`: that one only writes the row, this
one also notifies. `publishSocialPost` calls it on a `LinkedinPublishError` of kind `auth`, reason
`access_rejected`. Mail and cloud drive get the same call in #408.

## apps/api

- `publishSocialPost` calls `resolveUserLinkedinPublisher`. Anything but `ready` returns
  `linkedinNotConnected`. A `LinkedinPublishError` of kind `auth` flags the connection, returns
  `linkedinNotConnected` and leaves the post status unchanged. Any other error marks the post
  **Failed** as today.
- `social-post-media.service.ts`: `uploadPostMediaToLinkedIn` becomes
  `uploadSocialPostImages({ publisher, media })`. It keeps the R2 download and calls
  `publisher.uploadImage` per item. `PublishableImage` and `UploadPostMediaResult` go away.
- Inline parameter object types become named interfaces.

## Tests

- Delete `packages/testing/src/mocks/linkedin-provider.mock.ts`, its re-export in
  `provider-mocks.ts`, the `@repo/linkedin` mock in `apps/api/test/preload.ts`, and the mentions
  in `apps/api/test/README.md`, `packages/testing/README.md` and
  `apps/api/test/email/support/email-queue.mock.ts`.
- `packages/testing/src/social/vendors/linkedin.routes.ts` (`LINKEDIN_ROUTES`) and
  `linkedin.fixture.ts`: happy-path routes for the four calls above, added to `BASE_ROUTES`.
  Fixtures are trimmed real response shapes.
- Add `api.linkedin.com` and the upload host (`www.linkedin.com`) to `VENDOR_HOSTS`.
- Reuse `seedLinkedinConnection` in `packages/testing/src/integrations/connection-fixtures.ts`. It
  must enable `linkedin-posting` by default and accept `integrationIds`, so US-1.1 can seed a
  connection with posting turned off.
- Tests pass `recordVendorSleep` through `resolveUserLinkedinPublisher({ sleep })`, like cloud
  drive.
- No contract suite: one vendor.

## Extension points

- **Axis:** social network. **Contract:** none yet; `LinkedinPublisher` is the only implementation.
- **Known variants:** LinkedIn only. No issue names a second network.
- **Adding the next one:** extract `SocialPublisher` from `LinkedinPublisher` and rename the
  `Linkedin*` contract types to `Social*`. Add a catalog entry in category `social`, a vendor folder
  under `social/`, a registry `Record<IntegrationIdIn<'social'>, Factory>`, and a contract suite
  from the existing LinkedIn scenarios. `apps/api` swaps `resolveUserLinkedinPublisher` for a
  resolver keyed by integration id.
- **Faked in tests:** vendor HTTP, in `packages/testing/src/vendor-http`.
- **Packages considered:** none. The shared vendor client covers it.
- **Not abstracted:** the registry and contract, for the reason above.

## Spec and docs bookkeeping

- `specs/glossary.md`: add **social post**.
- `specs/architecture.md`: drop `linkedin/` from the package tree.
- `specs/linkedin-strategy.md`: point to `@repo/integrations/social` instead of `@repo/linkedin`.
- `apps/docs/src/content/docs/errors/linkedin-not-connected.mdx`: add the new causes.
- `apps/docs/src/content/docs/integrations/social-posts.mdx`: **Failed** row.
