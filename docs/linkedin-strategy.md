# LinkedIn Integration Strategy

Status: agreed 2026-07-14. Replaces the custom arctic OAuth flow from ragna-v2 (`packages/oauth`).

## Decision

Use **better-auth** for the LinkedIn connection instead of a custom OAuth flow.

Reasons:

- v3 already runs better-auth with a Drizzle adapter and an `account` table. A custom flow would duplicate state handling, callback routes, token storage, and refresh logic.
- LinkedIn is a built-in better-auth social provider. Connecting an account for a signed-in user is covered by account linking (`authClient.linkSocial`). Tokens land in the existing `account` table. No new schema.
- `auth.api.getAccessToken({ providerId: 'linkedin', userId })` returns a valid token server-side and refreshes it when possible. This also works from `apps/worker`, since `@repo/auth/server` is a plain package.

The only part of the old v2 package worth keeping is the API client (`linkedin-api-client.ts`). It is orthogonal to token acquisition and will be ported later into a small `@repo/linkedin` package that takes an access token.

## Constraints (LinkedIn platform)

1. **No refresh tokens for normal apps.** Programmatic refresh is limited to approved Marketing Developer Platform partners. Access tokens last about 60 days. The UI needs a "connection expired, reconnect" state.
2. **No draft posts via API for members.** Posts created with `w_member_social` must be `PUBLISHED`. Drafts therefore live in our own DB. The agent tool (v1) and the manual editor (v2) write the same draft rows. A shared publish action calls LinkedIn.
3. The LinkedIn developer app needs two products enabled: "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn".
4. Scopes: `openid profile email w_member_social`.

## Roadmap

### Phase 0: Account connection (current)

- Add `linkedin` to `socialProviders` in `packages/auth/src/server/auth.ts`. Credentials come from `@repo/config` (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_SCOPES`).
- Enable account linking with `allowDifferentEmails`, since the LinkedIn email may differ from the sign-in email.
- Connected-accounts UI on the account page: list, connect (`linkSocial`), disconnect (`unlinkAccount`). Port of the v2 `user-social-settings.tsx`, rebuilt in Vue.

### Phase 1: Agent draft tool (v1)

Design agreed 2026-07-14. Text-only posts. Media support comes in a later phase.

**Schema** (`packages/database/src/schema/social-post.schema.ts`):

`social_posts` table:

- `id`, `userId` (references user, cascade delete)
- `platform`: text, `'linkedin'` for now
- `content`: text (post body)
- `status`: `draft | published | failed`
- `source`: `agent | user` (v1 always `agent`, v2 adds `user`)
- `externalId`, `externalUrl`, `publishedAt`: set on successful publish
- `publishError`: set when publish fails
- timestamps

**Agent tool** (`packages/ai/src/tools/linkedin-draft.tool.ts`):

- One tool `linkedinDraft` with optional `draftId` input. Without id it creates a draft. With id it revises that draft. This avoids duplicate drafts when the user iterates in chat.
- Follows the `image-gen.tool.ts` pattern: Zod input schema, transient `data-linkedinDraft` writer event, returns only `{ id, status }` to the model.
- Registered in `agent.tools.ts` and added to the `AgentTool` union in `agent.schema.ts` so it is toggleable per agent.
- Drafting needs no LinkedIn token. It is a pure DB write.
- Also available in workflows: agent nodes inherit it via `activeTools`, and it is a selectable tool node (`WORKFLOW_TOOLS`). Tool nodes always create a new draft. The 1-3000 char limit is enforced in `social-post.service.ts`, which covers both paths.

**`@repo/linkedin` package** (new):

- Port of the v2 API client, rebuilt on the versioned `/rest/posts` API (not legacy `/v2/ugcPosts`). Requires the `LinkedIn-Version` header.
- v1 exposes only `createTextPost`. Author URN is `urn:li:person:{account.accountId}`. better-auth stores the LinkedIn `sub` in `account.accountId`, so no `/userinfo` call is needed.

**API** (`apps/api/src/controllers/social-post.controller.ts`):

- `GET /social-posts`: list the user's posts
- `PATCH /social-posts/:id`: edit draft content
- `DELETE /social-posts/:id`
- `POST /social-posts/:id/publish`: `getAccessToken({ providerId: 'linkedin', userId })` → `@repo/linkedin` `createTextPost` → update row to `published` (URN, URL, timestamp) or `failed` (error). Runs synchronously in the request. No worker job unless scheduling is added later.
- Publishing is user-triggered only. The agent drafts, the user publishes.

**Web UI** (minimal for v1):

- Dedicated "Social posts" page in the main nav.
- List of posts with status badge, publish and delete buttons.
- "LinkedIn not connected" hint linking to `/account` when no LinkedIn account is linked.
- The v2 editor will grow into this page.

### Phase 2: Manual drafting (v2)

- UI to list, create, and edit drafts by hand. Same table, same publish path.

## Open points

- Media (image) posts: port `registerImageUpload` / `uploadImage` from v2 to the versioned Images API.
- Scheduling posts (would move publishing into a worker job).
