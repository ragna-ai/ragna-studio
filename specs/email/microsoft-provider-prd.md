# Microsoft (Outlook) mailbox provider

> **Status: implemented** (merged to main via PR #22, 2026-09-24; all design questions
> answered; apps/api 482 pass / 0 fail; connect and first sync live-tested with Outlook, reply/forward/send and large attachments not yet). Adds Microsoft
> Graph as the second `MailProvider` next to Gmail. Builds on
> [prd.md](./prd.md) "Future directions" (provider enum, opaque
> `syncCursor`, everything behind `MailProvider`).

## Goal

A user can connect a Microsoft 365 / Outlook mailbox instead of Gmail. Every
existing email feature works the same on it: sync, AI categorization,
auto-draft, drafts (new/reply/forward), send, attachments, archive, trash,
star, read/unread, search.

## Decisions (Sven, 2026-09-24)

| #   | Topic              | Decision                                                                                                                                            |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Accounts per user  | One mailbox per user, Gmail **or** Outlook. Provider is picked at connect time. Switching means disconnect, then connect the other one.             |
| 2   | Tenant             | Keep the current `MICROSOFT_TENANT_ID` config. No auth change. Accounts outside it (e.g. personal outlook.com under `organizations`) can't connect. |
| 3   | Synced folders     | Well-known folders only: Inbox, Sent Items, Deleted Items, Junk Email, Archive. Drafts come through `listDrafts`, not delta.                        |
| 4   | Search             | Native passthrough. Gmail keeps Gmail syntax. Outlook gets Graph `$search` (KQL). The search hint text is provider-specific.                        |
| 5   | Folder state       | New provider-neutral `email_messages.folder` column. All folder filters move off Gmail label ids, for Gmail too.                                    |
| 6   | Outlook categories | Read-only label chips, same as Gmail user labels today. No write-back.                                                                              |
| 7   | Attachments        | 25 MB total, same as Gmail. Graph upload sessions for files over 3 MB.                                                                              |
| 8   | Focused/Other      | Ignored. One inbox. Our own AI categories do the sorting.                                                                                           |

## Non-goals

- Multiple mailboxes per user.
- Syncing custom Outlook folders, or writing categories back.
- Graph change-notification webhooks. Polling stays, same as Gmail.
- Shared mailboxes, delegated access, calendar.
- Changing sign-in behaviour or the tenant setting.

## Design

### 1. Provider-neutral folder

New type in `@repo/mail` (`mail-provider.ts`) and mirrored in
`@repo/database`:

```ts
export type MailFolder = 'inbox' | 'sent' | 'archive' | 'trash' | 'spam' | 'draft';
```

- `MailMessageMetadata`, `MailSyncFlagsChanged` and `MailActionResult` gain
  `folder: MailFolder`.
- `email_messages.folder` (text, NOT NULL, `$type<EmailMessageFolder>()`).
  Named `EmailMessageFolder` in the DB package, because apps/api already has
  a view-level `EmailFolder` (which also includes `starred`).
- `labelIds` stays. It now only drives the read-only label chips. Gmail keeps
  its raw label ids there. Outlook puts category display names there.

**Gmail mapping** (first match wins): `DRAFT` → draft, `TRASH` → trash,
`SPAM` → spam, `INBOX` → inbox, `SENT` → sent, otherwise archive.
Gmail `CHAT` messages are dropped by the Gmail provider (sync, seed, thread
fetch). They were only stored today to be excluded again.

**Outlook mapping**: by `parentFolderId`, resolved against the well-known
folder ids (fetched once per provider instance). inbox → inbox,
sentitems → sent, deleteditems → trash, junkemail → spam, drafts → draft,
archive → archive. **Any other folder (custom folders) → archive.** This
refines decision 3: mail moved into a custom folder stays visible as
archived instead of vanishing. It just stops receiving flag updates, because
custom folders aren't delta-synced.

**Behaviour change for Gmail (accepted):** the "archived" view used to be
"not INBOX/TRASH/SPAM/DRAFT", so it also listed sent mail. With a real
folder, Archived and Sent are disjoint.

**API view filters** (`resolveFolderFilter` in `email.service.ts`):

| View                          | `folder` (some message matches) | `excludeFolders` (no message may match) |
| ----------------------------- | ------------------------------- | --------------------------------------- |
| inbox                         | inbox                           | trash, spam, draft                      |
| archived                      | archive                         | inbox, trash, spam, draft               |
| trashed                       | trash                           | none                                    |
| sent                          | sent                            | none                                    |
| starred                       | none (`isStarred: true`)        | none                                    |
| default (category/label/none) | none                            | trash, spam, draft                      |

This is a 1:1 translation of today's label-based filters. Only the
predicate changes, from label containment to the folder column.

**Worker checks** move to the folder too: `isDraftMessage` →
`folder === 'draft'`, `isNonClassifiableMessage` → folder in
(sent, spam, trash).

**Migration**: no backfill (Sven, 2026-09-24). The column is
`NOT NULL DEFAULT 'inbox'`, only so the migration applies to a non-empty
table. Every writer sets `folder` explicitly. Existing rows are wrong until
the mailbox is disconnected and reconnected. That's accepted for local dev
and for production. Local: `db:push`. Production: `db:generate`.

### 2. Contract changes in `MailProvider`

- `MailFolder` and the `folder` fields above.
- `listRecentInboxThreadIds(limit: number): Promise<MailProviderId[]>`
  replaces the worker's `provider.search('in:inbox')` seed call, which was
  Gmail syntax.
- `SendMailThreadingInput` gains `replyToProviderMessageId: MailProviderId`.
  Graph threads a reply through `createReply(messageId)`, not through
  headers. Gmail ignores it.
- Sync rule, written down in the interface doc: an `added` change may name a
  message that is already indexed. Graph delta can't tell "created" from
  "updated". Consumers upsert, and only classify rows that are new.
- Shared errors: `MailProviderError` (with `status`, `body`) as the base
  class. `GmailApiError` and the new `GraphApiError` extend it. Two helpers
  replace the Gmail-named ones at call sites: `isMailAuthError` (401/403
  after the one-shot token refetch) and `isMailNotFoundError` (404).
  `isAuthGmailError` is removed, not aliased.
- `createMailProvider({ provider, getAccessToken })` factory dispatches on
  `'gmail' | 'microsoft'`.

### 3. Graph provider (`packages/mail/src/provider/graph/`)

Same file split as `gmail/`: `graph.client.ts`, `graph.types.ts`,
`graph.parse.ts`, `graph.sync.ts`, `graph.provider.ts`. Hand-rolled
`fetch`, no Microsoft SDK (same reasoning as
[gmail-client-decision.md](./gmail-client-decision.md): better-auth owns the
tokens and the endpoint count is small).

Resource shapes come from `@microsoft/microsoft-graph-types` (types only,
no runtime code, no dependencies; 2.43.1 at time of writing), added as a
devDependency of `@repo/mail` (Sven, 2026-09-24). Reason: Microsoft's docs
are less reliable than Google's, so the official types are the safer source
of truth. `graph.types.ts` holds only what the package lacks: the delta and
paging envelopes (`@odata.nextLink`, `@odata.deltaLink`, `@removed`) and the
upload-session response. Every Graph shape we consume must be typed through
the package or `graph.types.ts`, with no ad-hoc inline shapes.

- **Every request** sends `Prefer: IdType="ImmutableId"`. Without it, a
  message id changes whenever the message moves folder. That would break
  archive, trash and our unique index on `providerMessageId`.
- **Client**: retries 429/503 honouring `Retry-After`, plus 5xx and the
  one-shot 401/403 token refetch, mirroring `gmail.client.ts`.
- **Thread** = `conversationId`. `fetchThread` =
  `GET /me/messages?$filter=conversationId eq '…'`, sorted client-side
  (Graph rejects some filter + orderby combinations as inefficient).
- **Body**: Graph returns either HTML or text. Store what it returns. When
  it's HTML, derive `text` with the existing `html-to-text` helper in
  `@repo/mail/content`.
- **Profile + cursor**: `GET /me` for the address (`mail`, falling back to
  `userPrincipalName`). The cursor is JSON,
  `{ v: 1, folders: { inbox: deltaLink, sentitems: …, … } }`, initialised
  with `delta?$deltatoken=latest`, so the first sync doesn't page through
  the whole mailbox. A folder that doesn't exist (some mailboxes have no
  Archive) is left out.
- **Sync**: one delta call per folder in the cursor. Non-removed items →
  `added` (see the sync rule above). `@removed` items → one
  `GET /me/messages/{id}`. 404 → `deleted`. Found → `flagsChanged` with the
  new folder. That handles moves between folders, including a move that
  spans two sync passes. A delta link that has expired (410 /
  `syncStateNotFound`) → `cursorExpired`.
- **Seed**: `listRecentInboxThreadIds` = inbox messages ordered by
  `receivedDateTime desc`, deduped by `conversationId` until `limit`.
- **Actions**: star ↔ `flag.flagStatus` (`flagged` / `notFlagged`).
  read ↔ `isRead`. archive → move to archive, unarchive → move to inbox.
  trash → move to deleteditems, untrash → move to inbox.
- **Drafts**: new = `POST /me/messages`. Reply/forward =
  `createReply` / `createForward` on `replyToProviderMessageId`, then PATCH.
  `updateDraft` keeps the interface's full-replace semantics: PATCH every
  field, and replace the attachment set (delete removed, add new).
  `sendDraft` = `POST /me/messages/{id}/send`. `listDrafts` /
  `getDraft` read the drafts folder.
- **Send**: always build a draft, then send it. One code path, and it's the
  only path that allows upload sessions.
- **Attachments**: up to 3 MB inline as `fileAttachment`, above that
  `createUploadSession` with chunked PUTs. `attachmentId` and `partId` are
  both the Graph attachment id (stable while the message exists under
  immutable ids).
- **Labels**: `listLabels` = `/me/outlook/masterCategories`, id and name
  are both the category display name, type `user`.
- **Search**: `GET /me/messages?$search="<query>"` (inner quotes escaped),
  deduped to conversation ids. Graph pages with `@odata.nextLink`, which
  becomes the opaque `nextPageToken`.

**Open risk for the Graph slice to verify and report:** `SendMailResult`
needs the sent message's id. `POST …/send` returns 202 with no body, and the
Sent Items copy gets a new id. Plan: look the sent copy up by
`internetMessageId` with a short retry. Check what callers actually do with
`messageId` before building this.

### 4. Auth and connect

- Scopes for linking: `https://graph.microsoft.com/Mail.ReadWrite`,
  `https://graph.microsoft.com/Mail.Send`. `offline_access` is already in
  better-auth's Microsoft default scopes. Verify in node_modules how
  better-auth stores Microsoft's granted scopes on `account.scope`
  (separator and whether they're full URIs) before writing the check.
- Work tenants may require admin consent for `Mail.ReadWrite`. That surfaces
  as an OAuth error on the callback. The web shows it as a toast, no
  special handling.
- `email_accounts.provider` becomes `'gmail' | 'microsoft'`. It's set
  explicitly on connect, and the default is dropped.
- `POST /email/account/connect` takes `{ provider }`. The scope check and
  the token lookup dispatch on it (better-auth provider id `google` or
  `microsoft`).
- api: `getGmailProviderForUser` → `getMailProviderForUser`, which reads the
  `email_accounts` row to know the provider. The connect path, where no row
  exists yet, gets the provider from the request body instead.
- worker: `gmail-provider.ts` → `mail-provider.ts` with
  `getMailProviderForAccount(account)`, dispatching on `account.provider`.
- Reconnect (`reauth_required`) links the account's own provider again.

### 5. Web

- `EmailConnectPrompt` offers "Connect Gmail" and "Connect Outlook".
- `useEmailConnectFlow` takes the provider: `linkSocial({ provider: 'google'
  | 'microsoft', scopes })`. The callback params become provider-neutral
  (`mailConnect`, `mailReconnect`), and the provider travels in the
  callback URL.
- Settings shows the connected provider and address. Disconnect is
  unchanged.
- "Gmail" copy becomes provider-neutral ("mailbox") or uses the account's
  provider name. That covers i18n keys (both locales) and toasts.
- The search hint and the label-chip system denylist become
  provider-aware. The denylist only applies to Gmail.
- The attachment limit stays at 25 MB for both providers.

### 6. Worker jobs

The email sync/classify/draft processors are disabled on main (`38a591fc`,
commented out in `apps/worker/src/processors/index.ts`). This build
re-enables them (Sven, 2026-09-24).

## Build notes (2026-09-24)

- **Reply vs forward:** the contract doesn't tell them apart, so Graph uses
  `createReply` for both, then overwrites every field and the attachment
  set. The result matches Gmail (same thread, In-Reply-To set). Follow-up if
  a true Outlook forward is wanted: add `kind` to `SendMailThreadingInput`
  and use `createForward`.
- **`SendMailResult.messageId`:** for Graph this is the pre-send draft id.
  Callers only use `threadId`, so the lookup by `internetMessageId` wasn't
  built.
- **Graph `deleted` changes** carry `threadId: ''`. Delta's `@removed`
  carries no conversation id. The worker only reads `messageId`.
- **Entra setup (required):** better-auth rejects `linkSocial` with
  "untrusted provider" unless the email is verified, and Entra sends no
  `email_verified`. Fix: add the optional ID-token claim `xms_edov` in the
  app registration (Token configuration), plus delegated `Mail.ReadWrite`
  and `Mail.Send`. `auth.ts` maps `emailVerified` from `xms_edov === true`.
  `trustedProviders` was rejected: with tenant `organizations` it opens
  nOAuth-style account takeover on sign-in.
- **Delta cursor init (fixed after first live test):** Graph ignores
  `$deltatoken=latest` for messages and returns the whole folder.
  `getProfile()` originally left the cursor empty, so the first incremental
  sync imported the entire mailbox as `added` and classified ~150 old inbox
  messages. Now `getProfile()` (and any folder missing from the cursor)
  drains the initial delta to a `deltaLink` without emitting changes.
- **Classification age cutoff (Sven, 2026-09-24):** the worker only
  classifies mail received after `max(account connected, now -
  EMAIL_AUTO_CLASSIFY_MAX_MESSAGE_AGE)`, a duration like `1d` or `1w` (default `1d`). Both providers use a
  server-side receive time, so senders can't spoof it. Applies to Gmail
  too. Auto-draft follows, since it's triggered by classification.
- **Missing Archive folder:** archiving throws a `GraphApiError(404)`.
- **Graph client retries** use a small loop of their own instead of
  `retryExpoBackoff`, because that helper can't honour `Retry-After`.
- **Follow-ups, not built:** `folder` isn't exposed in thread/message API
  responses. The long Gmail-specific comments in the worker's
  draft-reconciliation functions are still there.

## Slices

See [microsoft-provider-slices.md](./microsoft-provider-slices.md).
