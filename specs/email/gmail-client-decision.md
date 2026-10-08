# Gmail client: hand-rolled fetch wrapper, not `@googleapis/gmail`

Decision record, 2026-08-14. Reference material, no build lifecycle.

`@repo/mail/provider`'s `GmailProvider` talks to the Gmail REST API v1
through a small hand-written fetch wrapper
(`packages/mail/src/provider/gmail/gmail.client.ts`) with locally declared
wire types, instead of the official `@googleapis/gmail` client. This
documents why, what it costs, and when to revisit.

## Decision drivers

1. **Auth is owned by better-auth, not by the HTTP client.** The official
   client's main value is its auth stack (`google-auth-library`): OAuth
   flows, token storage, automatic refresh. This app already has all of
   that in better-auth. Tokens live in better-auth's `account` table and
   are refreshed via `auth.api.getAccessToken()`. The provider receives an
   injected `getAccessToken: () => Promise<string>` and knows nothing
   else. Adopting the official client would mean configuring its auth
   layer to defer to ours, which is working against the library's core
   feature.

2. **Tiny endpoint surface.** The provider uses roughly eight endpoints:
   `users.history.list`, `users.threads.get`, `users.messages.get`,
   `users.messages.send`, `users.messages.modify`, `users.labels.list`,
   `users.messages.attachments.get`, `users.getProfile`. All are plain
   JSON REST with Bearer auth. The custom client is one fetch wrapper
   (Bearer header, JSON parsing, 429/5xx retry via `@repo/utils`'
   `retryExpoBackoff`) plus wire types for exactly those responses.

3. **Repo dependency policy.** Every dependency must be justified.
   `@googleapis/gmail` pulls in `googleapis-common` and
   `google-auth-library` with their transitive trees. The provider shipped
   with zero new runtime dependencies instead: outgoing RFC 822 MIME is
   built with nodemailer's `MailComposer` (nodemailer was already a
   dependency of `@repo/mail` for transactional mail).

4. **The abstraction already isolates the choice.** Everything outside
   `gmail.provider.ts` speaks the provider-agnostic `MailProvider`
   interface; Gmail wire types never leave that file. The official
   client's generated types would only ever benefit one file's internals.
   The planned Microsoft provider will be hand-rolled against the Graph
   API regardless, so the official Gmail client would not buy
   cross-provider consistency either.

## Accepted tradeoffs

- **We own the wire types.** Google maintains the official client's
  typings; ours are hand-written for the used subset. If Gmail changes a
  response shape, we fix it ourselves instead of bumping a package.
- **We own the protocol quirks.** base64url encoding/decoding, MIME
  payload-tree walking, RFC 2047 / RFC 5322 address parsing are all
  hand-rolled (the address parsing is documented best-effort; pathological
  RFC 5322 edge cases are not fully covered). These were smoke-tested at
  build time, but there is no upstream fixing them for us.
- **No generated coverage of unused endpoints.** Adding a new Gmail call
  means writing its wire type first. This is treated as a feature (every
  endpoint in use is visible and typed deliberately), but it is extra
  work per endpoint.

## When to revisit

- The endpoint surface grows well beyond the current handful, e.g. batch
  requests, resumable uploads for large attachments, or Pub/Sub
  `users.watch` push sync (planned as a possible later replacement for
  polling).
- Wire-type drift bugs appear more than rarely, which would mean the
  maintenance cost we accepted is being paid too often.
- Google materially changes the REST auth or encoding conventions the
  wrapper assumes.

## Swap cost, if it ever happens

Contained by design: `gmail.client.ts`, `gmail.types.ts`, and the
internals of `gmail.provider.ts` change; the `MailProvider` interface and
every consumer (apps/api, apps/worker, apps/web) stay untouched.
