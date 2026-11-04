# Google APIs: hand-rolled client, not the official SDK

Decision record, 2026-11-04. Reference material, no build lifecycle. Extends
[the Gmail client decision](../../email/gmail-client-decision.md) (2026-08-14) to every Google
capability: Gmail and Google Drive (#265).

Gmail and Drive call Google's REST APIs through the shared vendor client in
`packages/integrations/src/http/` (native `fetch`, zod parsing). We don't use `googleapis`,
`@googleapis/gmail`, `@googleapis/drive` or `google-auth-library`.

## Candidates (checked 2026-11-04)

| Package                                   | License    | Last release | Weekly downloads | Transitive packages       | Verdict |
| ----------------------------------------- | ---------- | ------------ | ---------------- | ------------------------- | ------- |
| `googleapis`                              | Apache-2.0 | 2026-10-30   | 13.4 M           | about 45, 241 MB unpacked | No      |
| `@googleapis/drive` + `@googleapis/gmail` | Apache-2.0 | 2026-10      | 1.5 M each       | 46 together               | No      |
| `google-auth-library`                     | Apache-2.0 | 2026-11-03   | 131 M            | part of the 46            | No      |
| Shared vendor client (ours)               | AGPL-3.0   | n/a          | n/a              | 0                         | Keep    |

License and maintenance are fine. The reasons are fit and footprint.

## Decision drivers

1. **Auth is ours.** The SDK's core value is `google-auth-library`: OAuth flows and automatic
   refresh. Since #224, refresh runs in our token service under a Postgres lock shared by the API
   and the worker, because Google rotates refresh tokens. A second refresher would race it and
   revoke connections. Adapters only get a `getAccessToken()` function.
2. **No second HTTP client.** The packages run on `gaxios`, which brings `node-fetch`,
   `https-proxy-agent`, `gcp-metadata`, `json-bigint` and the `qs` tree. Its retries would double
   ours (429 and 5xx per connection, with `Retry-After`), and `GaxiosError` would need its own
   mapping to `VendorApiError`.
3. **Tests fake `fetch`.** The vendor HTTP fake in `packages/testing` answers by host and path on
   `globalThis.fetch`. Whether gaxios uses the global `fetch` was not checked. Verify it first if
   this is ever revisited.
4. **The SDK skips the hard part.** Of about 1,600 lines (shared client about 280, Drive about
   310, Gmail about 980), most of Gmail is MIME walking, base64url, address parsing and sync.
   The SDK returns raw payloads, so all of that stays ours. A switch would save the URL building
   and wire types, about 150 to 250 lines. Our zod parsing stays either way, because generated
   types don't validate responses.
5. **One style for every vendor.** Microsoft Graph is hand-rolled on the same client
   (`@microsoft/microsoft-graph-client` was rejected too). Both vendors share one client, one
   error type and one test fake.

## Rejected middle path

Generated types only, as a dev dependency with `import type`. `@googleapis/drive` isn't a
types-only package, so it still installs the 46-package tree, and our zod schemas already are
the source of truth for wire shapes.

## When to revisit

- Large Drive transfers: resumable or chunked uploads and downloads over 5 MB.
- Wire-type drift bugs appear more than rarely.
- Google changes its REST auth, upload or encoding conventions in a way our client doesn't
  follow.

Batch requests are not a trigger: the Node SDK doesn't support Google's batch endpoint either.
Gmail push (`users.watch`) is one JSON call and isn't a trigger on its own.

## Swap cost

Contained. Only the files under `packages/integrations/src/cloud-drive/google/` and
`packages/mail/src/provider/gmail/` change. The `CloudDriveProvider` and `MailProvider`
contracts, the registries and every caller stay as they are.
