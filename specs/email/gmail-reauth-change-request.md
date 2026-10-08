# Gmail Sync: Detect and Surface Dead Credentials (change request)

> **Status: implemented** (raised, decided, and built 2026-08-30; commit left
> to Sven per repo convention). Fixes a production bug: the Gmail sync job
> (`apps/worker/src/mail/email-sync.service.ts`) failing with a Gmail API 403
> whenever an account's Google OAuth access token had expired, with no
> self-healing and no signal to the user that anything needed their
> attention.

## Why

Sven reported: sync fails with a 403 once the Gmail access token expires.
Tracing it back through `@repo/auth` (better-auth) turned up the actual
defect, one level down from where it was reported:

`apps/worker/src/mail/gmail-provider.ts`'s `getGoogleAccessToken` calls the
stock better-auth `/get-access-token` endpoint
(`getValidAccessToken`, `better-auth/dist/api/routes/account.mjs`), which
only refreshes when `account.refreshToken && accessTokenExpired &&
provider.refreshAccessToken`. If `account.refreshToken` is falsy - missing
because the row was linked before `accessType: 'offline'` +
`prompt: 'consent'` were added to `packages/auth/src/server/auth.ts`'s
google provider config, or because Google silently revoked it (the
50-refresh-token-per-client cap, or the user revoking access) - that `if`
is skipped entirely: **no refresh, no error**. The function returns the
already-expired access token as if it were valid. The worker forwards it
straight to Gmail, which 403s.

Two compounding gaps made this worse than a one-off failure:

- `packages/mail/src/provider/gmail/gmail.client.ts`'s retry logic
  (`isRetryableGmailError`) only retried 429/5xx. A 401/403 - including the
  case where the token really had just expired a moment before better-auth's
  own 5-second refresh-buffer check ran - failed immediately, with no chance
  for a second `getAccessToken()` call to self-heal.
- `EmailAccountSyncState` was only `'idle' | 'syncing' | 'error'`. A dead
  refresh token and a one-off network blip looked identical to the UI: both
  just said "Sync error," with no indication that this one would never
  self-heal without the user reconnecting Gmail.

## Decisions

Agreed with Sven via discussion before implementation:

| Question | Decision |
| --- | --- |
| Fix scope | Two of four proposed items: (1) a distinct `reauth_required` sync state, (2) a retry-once-on-401/403 in the shared Gmail client. Explicitly **not** in scope: BullMQ `attempts`/backoff tuning for the email-sync queue, and a one-time production audit query for `account` rows with `provider_id = 'google' AND refresh_token IS NULL`. |
| How to retry | **Revised after initial build:** folded straight into the existing `isRetryableGmailError`/`retryExpoBackoff` call (`gmail.client.ts`) instead of a separate outer retry wrapper. The first version added a dedicated `withAuthRetry` layer specifically to give a 401/403 one immediate, no-backoff retry - reviewed as three retry-flavored layers deep (`gmailRequest` → `withAuthRetry` → `retryExpoBackoff` → `performGmailRequest`) for what is really one policy. Auth failures now share the same 3-attempt exponential backoff (500ms/1000ms/2000ms) as 429/5xx, which self-heals the same race just as well - the up-to-~3.5s extra latency before a genuinely dead credential's final error surfaces is a non-issue for a background job or an occasional live mailbox action, and not worth a second retry mechanism. |
| Where the retry lives | `gmail.client.ts` (shared by every Gmail call - sync, classify, draft, send), not duplicated per call site. |
| UI treatment | Full: distinct badge label/icon, a toast on the transition, and a working "Reconnect Gmail" button (not just a passive status indicator). "Sync now" stays enabled regardless of `syncState` - see Scope §4 for why disabling it on `reauth_required` was tried and reverted. |
| Reconnect mechanism | Reuse `linkSocial()` exactly as the initial connect flow does (`useEmailConnectFlow.ts`) - `accessType: 'offline'` + `prompt: 'consent'` apply to every authorization, so re-consenting on the *same* linked Google account reissues a refresh token via better-auth's existing account-linking, no new endpoint needed. On return from Google, call `POST /email/account/sync` (not `/email/account/connect`, which 400s on an already-connected account) to kick a fresh sync immediately. |

## Scope

### 1. Retry on 401/403, forcing a fresh token check

`packages/mail/src/provider/gmail/gmail.client.ts`: `isRetryableGmailError`
(the predicate `gmailRequest`/`gmailRequestVoid` already pass to
`retryExpoBackoff`) now also matches a `GmailApiError` with status 401 or
403, via the exported `isAuthGmailError` helper - one shared retry loop,
not a second one layered on top. Since `fetchGmail` calls `getAccessToken()`
fresh on every attempt (never cached), each retry's `getAccessToken()` call
re-evaluates better-auth's expiry check - self-healing the case where the
token had genuinely just expired. An account with no usable refresh token
gets the same stale token back on every attempt and exhausts all 3 retries;
that final error is what propagates to the caller.

### 2. `reauth_required` sync state

`packages/database/src/schema/email.schema.ts`: `EmailAccountSyncState`
gains `'reauth_required'` (plain `text` column, no migration - `db:push`
not even required for a new allowed string value). Distinct from `'error'`:
signals "will not self-heal, needs the user to reconnect," not "transient,
will retry next tick."

### 3. Worker: classify which failure is which

The 401/403 predicate is defined once, in `packages/mail/src/provider/gmail/gmail.client.ts`
(`isAuthGmailError`, exported through `gmail.provider.ts` and the package's
`provider/index.ts` barrel, same re-export chain `GmailApiError` already
uses) - it's also what `isRetryableGmailError` (Scope §1) checks, so the
"what counts as an auth failure" rule lives in exactly one place instead of
drifting between the retry logic and its callers. Both worker call sites
below import `isAuthGmailError` straight from `@repo/mail/provider` - no
worker-local alias or re-export, one name for the predicate everywhere it's
used.

- `email-sync.service.ts`'s `syncEmailAccount` catch block: sets
  `syncState: 'reauth_required'` instead of `'error'` when
  `isAuthGmailError` is true, still rethrows either way (BullMQ retry
  semantics unchanged - `attempts: 1` today either way, see Non-goals).
- `email-classify.service.ts`'s `classifyEmailMessage`: `ensureMessageBody`
  (the one Gmail call on this path - fetches a message's body if the sync
  job hadn't already persisted it) is wrapped so a `isAuthGmailError`
  error flags the account `reauth_required` and leaves the message
  uncategorized, instead of failing the classify job outright. This extends
  the module's existing best-effort philosophy ("an LLM failure leaves the
  message uncategorized rather than failing the job") to cover the Gmail
  fetch too, not just the model call.

### 4. Frontend: surfaced state, working reconnect CTA

- `apps/web/app/features/email/types/index.ts`: `EmailAccountSyncState`
  widened to match.
- `EmailSyncStatusBadge.vue`: distinct label (`email.sync.reauthRequired`)
  and icon (`AlertTriangleIcon`) for `reauth_required`, same
  `text-destructive` treatment as `error`.
- `EmailSidebar.vue`: **Reversed after initial build.** "Sync now" was
  first also disabled while `reauth_required`, reasoning a plain retry
  can't fix a dead credential - but the account cache's `syncState` right
  after a successful reconnect is still whatever enqueue-time snapshot
  `finishReconnect`'s own sync call returned, which can still read
  `reauth_required` until the worker's next poll tick catches up
  (`useSyncEmailAccount`'s doc comment, `useEmailAccountApi.ts`). Disabling
  on that state left the button unclickable in exactly the window right
  after fixing the problem. Reverted to gating only on `isSyncing`, same as
  before this change - clicking it in any terminal state (`error` or
  `reauth_required`) is a harmless retry either way, not something worth
  blocking.
- `EmailClient.vue`: toasts `email.sync.reauthRequiredToast` on every
  transition into `reauth_required` (not gated on having observed
  `syncing` first - the worker can set it straight from an `idle` cron
  tick). Also gains a second OAuth-return branch,
  `GMAIL_RECONNECT_CALLBACK_PARAM`, alongside the existing connect one.
- `useEmailConnectFlow.ts`: `startReconnect`/`finishReconnect` alongside
  the existing `startConnect`/`finishConnect` - same `linkSocial()` call
  under the hood, parameterized callback query param
  (`gmailReconnect` vs `gmailConnect`). `finishReconnect` calls
  `useEmailAccountApi.ts`'s existing `useSyncEmailAccount()` mutation
  (the same one the sidebar's "Sync now" button fires) rather than issuing
  its own `POST /email/account/sync` - that composable already seeds the
  account cache from the response and opens the forced polling window
  (`email-account-sync-poll.ts`), which is what lets the UI observe the
  reconnect's sync actually settle instead of waiting on the plain 3s
  "syncing" poll.
- `EmailSettingsGeneral.vue`: a "Reconnect Gmail" button + hint text,
  visible only when `syncState === 'reauth_required'`, wired to
  `startReconnect('/mail')` (same return path the initial connect prompt
  uses - `EmailClient.vue` is the one place that finishes either flow on
  return from Google, so settings redirects back through `/mail`).
- i18n: `email.settings.general.reconnect`/`reconnectHint` and
  `email.sync.reauthRequired`/`reauthRequiredToast` added to both
  `en-UK.json` and `de-DE.json`.

### 5. Cron: stop re-fanning out known-dead accounts

**Added after local testing surfaced it** (corrupting an account's tokens
per the manual test recipe below showed the same job id failing on every
cron tick, not a BullMQ retry - `email-sync-queue` has no `attempts`
override, see Non-goals). `emailSyncCronProcessor`
(`apps/worker/src/crons/email-sync.cron.ts`) fanned out a sync job for
*every* connected account on every tick via `listEmailAccounts()`, with no
filter - so an account already known `reauth_required` got re-enqueued and
re-failed against the real Gmail API every single interval, indefinitely,
until the user reconnected. Renamed to `listEmailAccountsDueForSync`
(`packages/database/src/repositories/email-account.repo.ts`) and added
`where: { syncState: { ne: 'reauth_required' } }` - its only caller. The
account rejoins the cron's fan-out the moment `syncState` moves off
`reauth_required` again, which happens two ways: the worker's own next
successful sync/classify pass, or immediately on reconnect, since
`syncEmailAccountNowForUser` (the manual "Sync now" / `finishReconnect`
endpoint) enqueues directly and doesn't go through this query at all.

### 6. Tests

`apps/api/test/email/account.test.ts`: both `z.enum(['idle', 'syncing',
'error'])` literals (the status-response schema and the full-account-response
schema) widened to include `'reauth_required'`.

## Non-goals

- **BullMQ retry/backoff for the email-sync queue.** `queue.emailSync().add(...)`
  bypasses `bullmq.service.ts`'s `defaultJobOptions` (called via BullMQ's own
  `Queue.add()`, not the `queueAddJob` wrapper), and the queue itself sets no
  `attempts` override - so today a sync job gets exactly one attempt per
  cron tick before sitting in whatever `syncState` the catch block left it
  in. Deliberately not tuned in this pass; Sven scoped this change to the
  credential-detection problem, not job-retry policy. (Scope §5 stops the
  *cron* from re-enqueuing a `reauth_required` account every tick, which is
  a different mechanism from BullMQ job-level retries and was judged
  in-scope - it's the same "don't hammer a known-dead credential"
  principle this whole change request exists for, not a retry-policy
  change.)
- **Production audit query** for `account` rows with `provider_id = 'google'
  AND refresh_token IS NULL`, to size how many existing connections are
  already silently broken. Not run; the fix here makes any such account
  self-report as `reauth_required` on its next sync/classify attempt instead,
  which was judged sufficient.
- **Forcing a token refresh on a 401/403, ahead of falling back to
  `reauth_required`.** Considered during review: better-auth's
  `getValidAccessToken` (`auth.api.getAccessToken`, what
  `getGoogleAccessToken` in `apps/worker/src/mail/gmail-provider.ts` calls)
  only refreshes when its own stored `accessTokenExpiresAt` says the token
  is due - never by validating the token against Google - so a token
  invalidated *before* that stored expiry (with a perfectly good refresh
  token still on file) isn't refreshed by our retries: `isRetryableGmailError`
  just re-asks the same "has enough time passed?" question and gets the
  same stale token back each time, landing on `reauth_required` even though
  reconnecting wasn't strictly necessary. Not fixed, on the actual odds:
  of the realistic causes, "user revoked access" and Google's
  50-refresh-token-per-client cap both kill the refresh token itself, so a
  forced refresh would fail the exact same way regardless - only "Google
  invalidates the access token early for some other reason (e.g. a
  password change) while the refresh token still works" would actually be
  saved by this, and that's a narrow window that a one-click "Reconnect
  Gmail" already resolves at negligible cost. Not worth a second refresh
  mechanism (with its own failure modes) to shave off one click in a rare
  case.
- **`apps/worker/src/mail/email-draft.service.ts`** (the AI auto-draft
  generator) and **`apps/api/src/services/email.service.ts`**'s many
  `getGmailProviderForUser` call sites (every synchronous mailbox action -
  send, archive, star, etc.) share the exact same dead-credential exposure
  but are not touched here. The API paths already surface a live error to
  the user in the moment (different UX problem than a silently-stuck
  background job); the draft generator is a background job with the same
  silent-stuck-state risk as classify and is the most likely next candidate
  if this pattern needs extending further.

## Open points

None currently open; the draft-generator gap above is a known, deliberately
deferred follow-up, not an open question.
