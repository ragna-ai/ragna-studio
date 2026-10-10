# Backlog

Open follow-ups, so nothing gets lost between PRs. Each item links its source. Remove an item
when it ships; move it into a PRD when it gets designed.

## Now

- [ ] Cloudflare redirect rule `docs.ragna.io/` to `/getting-started/introduction`: switch 302 to
      301 once verified (slashless docs URLs shipped in PR #104).

## Hardening (worker tests and v2/v3 leftovers)

Worker test suite shipped in PR #103 ([specs/testing/worker-prd.md](./testing/worker-prd.md)).
Batch 1 (video author check, purge limit, dead `verify` job, email enqueue tests, `ai` fake
removal): [specs/hardening/batch-1-prd.md](./hardening/batch-1-prd.md).

- [ ] Worker test gaps: inline agent node (`getDefaultAgent()` path), team and tool executors.
- [ ] AI provider mock covers only anthropic, openai, black-forest-labs and google-vertex
      (`ai-sdk-provider.mock.ts`). Also mock `@ai-sdk/google`, `@ai-sdk/mistral` and
      `@ai-sdk/openai-compatible` (lm-studio), so no test can reach a real provider. Add tests
      that run an unsupported provider (`getLanguageModel` / `getImageModel` /
      `getEmbeddingModel` / `getVideoModel` throw `Unsupported provider`) through a workflow
      agent node, an email draft and an image/video job, and assert the run/row fails cleanly.
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
      updates and deletes run per change; media sweep cron runs `deleteMediaIfUnreferenced` (one
      refcount query each) per candidate (`sweepUnreferencedMedia` in `media.service.ts`).

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
- [ ] Outlook connect drains the initial Graph delta inside `POST /email/account/connect`
      (`getProfile()`). Took ~2s on a small mailbox; a large one may hit a proxy timeout. Move the
      drain to the worker if that happens.
