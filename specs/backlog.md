# Backlog

Open follow-ups, so nothing gets lost between PRs. Each item links its source. Remove an item
when it ships; move it into a PRD when it gets designed.

## Now

- [ ] Cloudflare redirect rule `docs.ragna.io/` to `/getting-started/introduction`: switch 302 to
      301 once verified (slashless docs URLs shipped in PR #104).
- [ ] Follow-ups from the user docs rework (apps/docs feature guides):
  - Docs: remove credits from `reference/environment-variables.mdx` and
    `self-hosting/optional-providers.mdx`, or keep them until credits ship.
  - Docs: env var "Default" column shows code defaults, the installer writes `.env.example`
    values (`SMTP_PORT`, `LOG_LEVEL`, `DB_PORT`, `REDIS_PORT`, ...). Rename the column and add a
    note. Also add `APP_PORT`, `API_PORT`, `DB_TYPE`, and the rule that `S3_ENDPOINT` needs all
    other `S3_*` values plus `MEDIA_URL`.
  - Docs: example version is `0.5.0` in `install-options/docker-compose.mdx` and the env var
    reference. Pick `0.6.1` or `X.Y.Z`.
  - Docs: `integrations/mcp.mdx` can't name Claude's client ID URL for `MCP_ALLOWED_CLIENT_IDS`,
    so self-hosters can't connect Claude Desktop. Publish it or keep the page generic.
  - Web: UI strings "Connect this app to Ragna" and "Allow external AI apps to access Ragna
    (MCP)" break the brand rule. Fix in the locales, then update `mcp.mdx`.
  - Web: `chat.create.label` is missing in `en-UK.json`; agent form strings (memory panel,
    document panel, Chat button, Default badge) are hard-coded English.
  - Workflows: the Tool node is in the palette, but `WORKFLOW_TOOLS` is only `placeholder`.
    Hide it or wire up real tools.
  - Team chat phase 1 has no UI in apps/web. Decide whether to expose or drop it.
  - Specs: set status to implemented for `chat/search-prd.md`, `mcp/prd.md`, `mcp/slices.md`
    and the email drafts, bulk trash and HTML content change requests, then `pnpm specs:index`.
  - Repo: add a rule to AGENTS.md and the PRD template that a user-visible change updates its
    `apps/docs` page in the same PR.

## Security

- [x] OAuth and MCP hardening, shipped in PR #110 (v0.6.2, 2026-10-16):
      [specs/security/oauth-mcp-hardening-prd.md](./security/oauth-mcp-hardening-prd.md).
      Mail token revocation, MCP audit trail, consent page redirect host.
- [ ] LinkedIn sign-in requests `w_member_social` up front. Request it only on the account
      page's LinkedIn connect (`linkSocial` with `scopes`), and have the social post service
      return "reconnect LinkedIn". First verify with a test app that LinkedIn honors a second
      authorization with extra scopes, and that better-auth merges them into `account.scope`.
- [ ] Features resolve a provider account by `userId + providerId` (`findFirst`, no order). With
      `allowDifferentEmails`, a user can link the same provider twice (Google, Microsoft or
      LinkedIn; e.g. sign-in with A, mailbox with B), so a feature may use the wrong token. Mail:
      store the linked `account.id` on `email_account` at connect and resolve through it (api
      `email-provider.service.ts`, worker `mail/mail-provider.ts`). LinkedIn posting has the same
      gap. Part of the account linking review, see the next item.
- [ ] Account linking review: decide which provider accounts a user may link (one per provider?
      different emails?) and what each one is for (sign-in, mail, LinkedIn posting). Today the
      rules are implicit and features guess the right row.
- [ ] White-labeling: decide which surfaces carry the brand (app UI, public docs, emails). Then
      adjust the AGENTS.md branding rule and sweep (docs mention RAGNA about 80 times on 24 pages;
      UI strings like "Connect this app to Ragna"). The UI likely needs a configurable app name.
- [ ] Better Auth 1.8 upgrade, once 1.8 is stable. Gap analysis against the beta:
      [specs/auth/better-auth-1.8-gap-analysis.md](./auth/better-auth-1.8-gap-analysis.md).
      Must-do: `oauthClient.sector_identifier` column before the bump.

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
- [ ] Replace `email-reply-parser` with a small line-based reply parser in `packages/mail`, or
      add `re2` so the library uses a linear regex engine. Today `emailBodyToText` caps its
      input instead.
- [ ] Watch [dependabot-core#15904](https://github.com/dependabot/dependabot-core/issues/15904):
      GitHub's dependency graph reads only the first YAML document of a pnpm 12 lockfile. Until
      it's fixed, `pmOnFail: ignore` (PR #118) keeps the lockfile single-document and the CI
      step "Lockfile is a single YAML document" (PR #124) guards it. Once fixed, drop both, so
      pnpm switches to the pinned version on its own again.

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
