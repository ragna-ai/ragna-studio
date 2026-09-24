# Microsoft provider: implementation slices

> **Status: implemented** (approved and built 2026-09-24, merged via PR #22). Build plan for
> [microsoft-provider-prd.md](./microsoft-provider-prd.md).

Two phases. Phase 1 lands the shared contract so the four phase-2 slices can
run in parallel against real types instead of against prose.

## Rules for every slice

- Load the `clean-code` skill first. No `as any`. Named exported interfaces
  for return types.
- Comments: do NOT follow the repo's existing long-comment pattern. Default
  to zero comments. Only a non-obvious "why", one line max. No doc
  paragraphs, doc cross-references or investigation narrative. In code you
  add or rewrite, trim long existing comments to one line or remove them.
  Leave comments in untouched code alone.
- Stay inside your owned paths. If you need something outside them, stop
  and report it. Don't edit it.
- After editing a `@repo/*` package, rebuild it with
  `pnpm --filter @repo/<pkg> build`.
- Only slice 3 runs `bun test` (apps/api). No other slice runs tests.
- No commits, no `db:push`. Sven does both.
- End your report with a **Flags** section: every assumption, every doubt,
  every place you deviated from the PRD.

## Phase 1: contract (one agent, serial)

### Slice 1: contract + DB + Gmail adaptation

Owns `packages/mail/src/provider/mail-provider.ts`,
`packages/mail/src/provider/index.ts`, `packages/mail/src/provider/gmail/**`,
`packages/mail/src/provider/errors.ts` (new),
`packages/database/src/schema/email.schema.ts`,
`packages/database/src/repositories/email-*.repo.ts`,
`packages/database/drizzle/**`.

1. `MailFolder`, the `folder` fields, `listRecentInboxThreadIds`,
   `replyToProviderMessageId`, the "`added` may be re-emitted" doc rule
   (PRD section 2).
2. `MailProviderError` base class, `isMailAuthError`, `isMailNotFoundError`.
   `GmailApiError` extends the base. Remove `isAuthGmailError`.
3. `createMailProvider({ provider, getAccessToken })`. The `microsoft` branch
   throws "not implemented" until slice 2 replaces it.
4. Gmail provider: folder mapping, CHAT drop, `listRecentInboxThreadIds`
   (via its own internal `in:inbox` search), `folder` on action results.
5. DB: `EmailMessageFolder`, `email_messages.folder` (+ index on
   `(account_id, folder)`), `EmailProvider = 'gmail' | 'microsoft'` with no
   default. Repos: upsert and flag-update accept `folder`. The thread-list
   filter gets `folder?: EmailMessageFolder` and
   `excludeFolders?: EmailMessageFolder[]`, replacing
   `labelId`-for-folders and `excludeLabelIds`. Keep `labelId` for the
   label-chip filter.
6. `folder` is `NOT NULL DEFAULT 'inbox'`, no backfill. Run `db:generate`
   for the production migration.
7. Rebuild `@repo/mail` and `@repo/database`.

Call sites in apps/api, apps/worker and apps/web are left broken on purpose.
Phase 2 fixes them.

## Phase 2: four agents in parallel

### Slice 2: Graph provider (`@repo/mail`)

Owns `packages/mail/src/provider/graph/**` and the `microsoft` branch of
`createMailProvider`. Implements PRD section 3 in full. Add
`@microsoft/microsoft-graph-types` as a devDependency of `@repo/mail` and
run `pnpm install`. Graph types must not leak into `@repo/mail`'s exported
types; if they would, report it instead of promoting the dependency. Report on the
`SendMailResult.messageId` open risk with what you found in the callers
(read apps/api and apps/worker, don't edit them). Rebuild `@repo/mail`.

### Slice 3: apps/api

Owns `apps/api/src/**` email files and `apps/api/test/email/**`.

- `email-provider.service.ts` → provider-neutral: `getMailProviderForUser`,
  scope status per provider, better-auth provider id `google` / `microsoft`.
  Verify the Microsoft `account.scope` format in node_modules first.
- `POST /email/account/connect` takes `{ provider }` (zod).
- `resolveFolderFilter` → folder columns (PRD table).
- Replace `GmailApiError` / `isAuthGmailError` usage with the shared
  helpers. Pass `replyToProviderMessageId` wherever `thread` is built.
- Tests: update the provider mock to fake `createMailProvider`. Add
  fixtures for a linked Microsoft account. Cover connect for both providers,
  the missing-scope 400 for Microsoft, and the folder views. The suite must
  be green.

### Slice 4: apps/worker

Owns `apps/worker/src/mail/**`.

- `gmail-provider.ts` → `mail-provider.ts`, `getMailProviderForAccount`
  dispatching on `account.provider`.
- Seed through `listRecentInboxThreadIds`. Folder-based draft and
  non-classifiable checks. Persist `folder` on upsert and flag changes.
- `added` for an already-indexed message: update it, never re-classify.
- `isMailAuthError` for `reauth_required`.
- Re-enable the sync/classify/draft processors in `processors/index.ts`
  (PRD section 6).

### Slice 5: apps/web

Owns `apps/web/app/features/email/**`, `apps/web/app/pages/mail/**`, and the
email i18n keys in both locales.

- Connect prompt with two providers. `useEmailConnectFlow(provider)` with
  neutral callback params. Reconnect uses `account.provider`.
- `EmailAccount` type gains `provider`. Settings shows it.
- Neutral copy. Provider-aware search hint and label denylist.

## Integration pass (teamlead, after phase 2)

Check the seams on disk: the `createMailProvider` signature across
api/worker, `folder` on every upsert path, the connect body between web and
api, and the slice reports' Flags. Then hand over to Sven for `db:push`, a Gmail
disconnect/reconnect, and a manual connect with a real Outlook mailbox.
