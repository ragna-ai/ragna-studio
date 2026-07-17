# Workflows: email trigger

**Status: draft PRD, under review. Not implemented.**

Companion to [README.md](./README.md) (architecture overview) and [workflows-scheduling.md](./workflows-scheduling.md), whose scheduler machinery this reuses. Adds the first event-driven trigger: start a run when a new email arrives in a connected mailbox. Gmail is the v1 connector; the design is provider-neutral so Outlook (Microsoft Graph) can follow without touching the trigger core.

## Problem

Workflows can start manually or on a schedule. Both are initiated by our own system. Real automation value comes from reacting to outside events, and email is the highest-value first event source: "when an invoice arrives, extract and summarize", "when a customer writes, draft a reply and hold it for approval" (pairs with the HIL approval node).

## Use cases

1. **Triage / summarize**: new email matching a filter starts an agent that classifies or summarizes it.
2. **Draft-and-approve**: email in, agent drafts a response or action, approval node gates the side effect.
3. **Data extraction**: recurring machine mail (reports, invoices, alerts) parsed into structured output.

## Scope

**In (v1):** Gmail connector via polling. Provider-neutral trigger config, connector interface, cursor/dedup model. "Connect Google" via the existing better-auth account-linking flow.

**Out (deliberately):**

- Push delivery (Gmail `users.watch` + Pub/Sub webhooks). Polling first; push only changes the event source, not the run model.
- Outlook connector (design slot exists; the `microsoft` better-auth provider is already configured).
- Attachments, marking mail read, labeling, replying. Read-only trigger.
- Multiple linked accounts per provider per user.
- Generic webhook trigger kind (separate future addition to the `kind` union).
- Google OAuth production verification. `gmail.readonly` is a restricted scope; production approval requires a CASA assessment. Per the root README, testing-mode limits are acceptable for this app. Flagged as the main cost if this ever ships publicly.

## User experience

**Connecting:** the existing account page (`UserSocialSettings.vue`) already links Google via `authClient.linkSocial`. Connecting a mailbox is the same flow with the `gmail.readonly` scope added. The account list shows the extra grant.

**Builder:** the trigger node's `kind` select gains "Email". Config form: provider select (Google only for now), filter fields (from contains, subject contains), and a hint that the Google account must be connected. Publish fails with a clear error when it is not.

**Runs:** each matching email creates its own run. The runs list badge shows `email` as the trigger origin. The run view shows the rendered email as the run input, like any other input.

**Disconnection:** if polling hits a dead connection (account unlinked, token revoked), the owner gets a notification and the trigger stops until the workflow is re-published after reconnecting.

## Design decisions (proposed)

1. **Trigger config: `kind: 'email'` with a provider discriminator inside.**

   ```ts
   { kind: 'email'; provider: 'google'; filter: { fromContains?: string; subjectContains?: string } }
   ```

   The trigger machinery keys on `kind`; connectors key on `provider`. Adding Outlook is a new `provider` value plus a connector, no trigger-core change. Filter fields are provider-neutral and compiled per connector (Gmail: into a native `q` query).

2. **OAuth reuses better-auth account linking, exactly like LinkedIn.** No custom token storage, no new endpoints. Changes:
   - Server (`packages/auth`): the Google provider gains `accessType: 'offline'` and `prompt: 'consent'` so linking yields a refresh token.
   - Client: `linkSocial({ provider: 'google', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] })` from the existing connect mutation.
   - Worker reads tokens via `auth.api.getAccessToken({ body: { providerId: 'google', userId } })`, which refreshes automatically, mirroring `social-post.controller.ts`'s LinkedIn path.

3. **Polling rides the existing scheduler machinery.** An email trigger is a schedule under the hood: publish upserts the same per-workflow BullMQ job scheduler, with a fixed poll pattern (`*/2 * * * *`, UTC). The tick processor branches on the published trigger kind: `schedule` keeps its current behavior, `email` runs the poll (decision 6). Startup reconciliation and the orphan guard work unchanged, since they operate on the denormalized schedule columns.

4. **Denormalization:** new column `workflows.trigger_kind` (`'manual' | 'schedule' | 'email'`), set on publish. `schedule_cron` / `schedule_timezone` hold the poll pattern for email triggers so reconciliation stays column-driven. The list view uses `trigger_kind` to show a mail badge instead of the cron badge.

5. **Connector interface, worker-owned.** Types in `@repo/workflow` (which stays free of HTTP client deps), implementations in `apps/worker/src/workflow/mail/`:

   ```ts
   type MailMessage = { externalId: string; from: string; subject: string; date: string; bodyText: string };
   interface MailConnector {
     listNewMessages(args: {
       accessToken: string;
       cursor: string | null;      // opaque, connector-defined (Gmail: historyId)
       filter: EmailTriggerFilter;
       max: number;
     }): Promise<{ messages: MailMessage[]; nextCursor: string }>;
   }
   ```

   The Gmail connector uses plain `fetch` against the Gmail REST API (`history.list` from the cursor, `messages.get` for content, body decoded to text). No Google SDK dependency.

6. **Email tick semantics differ from schedule ticks.** Emails are discrete events, so the schedule overlap-skip policy does not apply: every matching message creates its own run, even while another run is active. Backpressure: at most 5 runs per tick; the cursor only advances past messages that produced runs (or were deduplicated), so the rest are picked up next tick. First tick after publish stores the current cursor and creates no runs (no backfill).

7. **Cursor and dedup.**
   - Cursor: new jsonb column `workflows.trigger_state`, holding `{ cursor, consecutiveFailures }`. Owned by the tick processor, cleared on publish.
   - Dedup: new nullable text column `workflow_runs.external_event_id` with a unique index on (`workflow_id`, `external_event_id`). Run creation is the idempotency point: a crashed tick that re-reads the same messages hits the constraint and skips. This also survives cursor resets.

8. **Run payload.** `triggered_by` gains `'email'`. The run input is the message rendered as plain text (From / Subject / Date header block, blank line, body text), keeping the `{{input}}` plain-text contract. Structured JSON input is a future option once a consumer needs it.

9. **Dead-connection guard.** When the tick cannot get a token (account unlinked, refresh rejected), it increments `consecutiveFailures`; on the 3rd consecutive auth failure it removes the job scheduler and enqueues a `workflow_trigger_disconnected` notification. Re-publishing after reconnecting re-arms the trigger. Transient API errors do not remove the scheduler; the next tick covers them (same philosophy as schedule ticks: `attempts: 1`, no retry).

10. **Publish-time validation.** Publishing a workflow with an email trigger verifies a linked Google account with the Gmail scope exists (via better-auth's account listing), and fails with a clear error otherwise. This keeps dead-on-arrival triggers out of the scheduler.

## Changes by package

| Area | Change |
| --- | --- |
| `@repo/workflow` | `email` member in the trigger `kind` union, `EmailTriggerFilter` + `MailMessage` + connector types, validation: email trigger structural checks |
| `@repo/auth` | Google provider: `accessType: 'offline'`, `prompt: 'consent'` |
| `@repo/database` | `workflows.trigger_kind`, `workflows.trigger_state` jsonb, `workflow_runs.external_event_id` + unique index, `triggered_by` accepts `'email'` (db:push); repo functions for cursor read/write |
| `@repo/queue` | `workflow_trigger_disconnected` in `NotificationDataMap` |
| `apps/worker` | Tick processor branches on trigger kind; `workflow/mail/` with connector interface dispatch + Gmail connector; token fetch via `auth.api.getAccessToken` |
| `apps/api` | Publish: derive poll schedule + `trigger_kind` for email triggers, linked-account validation |
| `apps/web` | Trigger form: email kind + filter fields, connect hint; `linkSocial` scope param in `useUserSocialAccounts`; list badge, `triggeredBy` badge, notification parser entry, i18n (`de-DE`, `en-UK`) |

## Open questions for review

1. **Poll interval:** fixed 2 minutes, or user-configurable (bounded, e.g. 1 to 15 minutes)? Proposed: fixed, configurable later.
2. **Raw query escape hatch:** expose an optional provider-native query field (Gmail `q`) next to the neutral filter fields? Proposed: no for v1; the neutral fields cover the showcase cases.
3. **Body handling:** plain-text part only, or HTML-to-text fallback when a message has no text part? Proposed: include an HTML-to-text fallback, since much real mail is HTML-only.
4. **Backfill:** always start from "now" (proposed), or offer "process the latest N existing matches" on publish?
