# Backlog

Open follow-ups, so nothing gets lost between PRs. Each item links its source. Remove an item
when it ships; move it into a PRD when it gets designed.

## Now (after PR #97 and #98, merged 2026-10-10)

- [ ] Browser checklists in PR #97 (9 points) and PR #98 (6 points), on `main`.
- [ ] Release and deploy: migrations `workspace_visibility`, `private_workspace_backfill`
      (`--custom`) and `email_default_agent_private_only` (`--custom`). Backup before deploy.

## Hardening PRD (worker tests and v2/v3 leftovers)

To be written as its own PRD.

- [ ] Worker test harness. Untested today:
  - purge cron and its job wrappers, BullMQ wiring
  - null-user handling in workflow runs and notifications
  - schedule tick skip when the author can't run it (v3, `workflow-schedule.processor.ts`)
  - `DELETE_MEDIA_OBJECTS_JOB` case (v3, `purge.processor.ts`)
  - email draft agent resolution in the worker (#98, `email-draft.service.ts`)
- [ ] Invitation email enqueue is untested (skipped under `config.isTest`).
- [ ] Purge cron has no per-run `LIMIT` (`listUserIdsDeletedBefore`,
      `listOrganizationIdsDeletedBefore`).
- [ ] Dead code: `templateId: 'verify'` in `apps/worker/src/processors/email.processor.ts`;
      `@repo/mail` registers no such template.
- [ ] Migrations are only checked on scratch DBs by hand. Consider a CI step that runs
      `migrate.ts` on a fresh Postgres.

## Code cleanup

- [ ] Nested `await` in returns and call arguments (clean-code rule 10), about 30 older spots.
      Separate PR. Found in: `creditGuard.ts:39`, `chat.service.ts:365`,
      `task-attachment.service.ts:205`, `social-post.service.ts:345`,
      `agent-context-document.service.ts:382,464`, `media.service.ts:278,396`,
      `agent.executor.ts:28`, `team.executor.ts:240,269`, `engine.ts:89`,
      `packages/ai` (`videogen.service.ts:574`, `agent.service.ts:163`, `web-browser.tool.ts:59`),
      `packages/mail` (`gmail.provider.ts:193,426`, `graph.provider.ts:145,268,562`,
      `graph.client.ts:225`, `transporter.ts:13`), `packages/linkedin/src/api-client.ts:160,236`,
      `organization-invitations.ts:96`, `auth-seed.ts:119,120`, `email.service.ts:1697`,
      web `useOrganizationApi.ts:72,135,155`.
- [ ] N+1 leftovers: email search `resolveSearchThread` hydrates per thread; email sync flag
      updates and deletes run per change.

## Parked features (need a decision or PRD first)

- [ ] Full RBAC on workspace resources: `viewer` role next to `manager` and `editor`.
- [ ] Shareable chats (own feature, WS auth implications).
- [ ] Task reminder recipients beyond the org owner (touches notifications).
- [ ] Workflow duplicate route. Today a schedule whose author was purged stays paused for good.
- [ ] Bucket-listing orphan sweep for R2 (catches objects whose rows are gone).
- [ ] Inviting existing accounts, multi-org membership.
- [ ] Co-owners.
- [ ] Org-scoped shared resources (agent templates, media, integrations).
- [ ] Seats and per-member billing.
- [ ] Per-user default agent preference; caching the guard's membership query.
- [ ] Workspace inboxes (team mailbox owned by a workspace).
- [ ] Email draft runs are not charged credits.

## Small

- [ ] Switcher group heading for personal workspaces reads "Personal" / "Persönlich" while the
      workspace is named "Private". Change the i18n label if it reads oddly.
