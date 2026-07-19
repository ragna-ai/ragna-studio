# API Standards: workspace-contained resources

The API grew two competing models. Most controllers treat the workspace as an
optional filter (flat routes like `/agent`, with `workspaceId` as a query param
or body field). The newer document and folder controllers treat the workspace
as a required container (`/workspace/:workspaceId/documents`). The frontend
switcher already behaves like the Google Cloud project picker.

This PRD unifies everything on the **container model** and defines the API
conventions all controllers must follow. It **supersedes the v1 filter model**
in [docs/workspaces/workspaces.md](../workspaces/workspaces.md) (optional
`workspaceId`, "All items", "Unassigned").

## Decisions

These are settled (discussed 2026-07-19). Do not re-open them.

| Decision              | Choice                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Model**             | Google-Cloud-style container. Every workspace-scoped resource lives in exactly one workspace. `workspaceId` is required, not null. |
| **Routes**            | Nested: `/workspace/:workspaceId/<resource>/...`. Singular resource names.                                                        |
| **"All items" view**  | Dropped. The user is always inside exactly one workspace. No cross-workspace aggregation endpoint.                                 |
| **"Unassigned" view** | Dropped. The concept no longer exists.                                                                                             |
| **Default workspace** | Auto-created per user at signup ("Personal"). Existing rows are backfilled into it.                                                |
| **Workspace delete**  | Cascades: contained resources are deleted with the workspace (FK changes from `set null` to `cascade`). Deleting the last workspace is rejected. |
| **Migration**         | Big bang. All controllers, repos, schema, and frontend composables move in one effort. No transition period.                        |
| **Access model**      | Workspace ownership is the access boundary. A shared guard verifies the user owns `:workspaceId`, then queries scope by `workspaceId`. Resource `userId` columns remain as authorship metadata only. |

## Route structure

### Workspace-contained resources

Everything a user creates inside a workspace nests under it:

```
/workspace                                              workspace CRUD (list, create, rename, delete)
/workspace/:workspaceId/agent                           agents
/workspace/:workspaceId/agent/:agentId/memory           agent memory
/workspace/:workspaceId/agent/:agentId/context-document agent context documents (was /agent/:agentId/documents)
/workspace/:workspaceId/chat                            chats
/workspace/:workspaceId/dataset                         datasets
/workspace/:workspaceId/dataset/:datasetId/row          dataset rows
/workspace/:workspaceId/document                        documents (was plural /documents)
/workspace/:workspaceId/folder                          folders (was plural /folders)
/workspace/:workspaceId/workflow                        workflows
/workspace/:workspaceId/workflow/:workflowId/run        workflow runs (see actions below)
/workspace/:workspaceId/social-post                     social posts (was /social-posts)
/workspace/:workspaceId/gen-image                       generated images (was /image/generate)
```

### Global and user-global resources

Not workspace-scoped. They stay flat:

```
/user           profile (user-global)
/notification   notifications (user-global, per workspaces.md)
/aimodel        AI model catalog (global; GET /aimodel replaces GET /aimodel/list)
/health, /auth  unchanged
/ws             websocket (unchanged; channel scoping is its own concern)
```

### Naming rules

- **Singular resource segments**: `/agent`, `/document`, `/social-post`. In
  most cases a single resource is requested, and this matches the existing
  majority of controllers.
- **Named path params**: always `:agentId`, `:documentId`, never `:id`.
  Nested routes make this mandatory (two `:id` params cannot coexist).
- **No verb paths for CRUD**: `GET /` lists, `POST /` creates, no `/list`.
- **Custom actions**: `POST /<resource>/:resourceId/<verb>`, e.g.
  `POST /workflow/:workflowId/publish`, `POST /workflow/:workflowId/run`,
  `POST /workflow/:workflowId/run/:runId/cancel`. This matches the existing
  publish/run/cancel/retry endpoints.

### Method semantics

| Method   | Meaning                                              |
| -------- | ---------------------------------------------------- |
| `GET`    | List (`/`) or read (`/:resourceId`). No side effects. |
| `POST`   | Create (`/`) or custom action (`/:resourceId/verb`).  |
| `PATCH`  | Partial update of mutable fields.                     |
| `PUT`    | Full replace only (e.g. agent memory, file upload).   |
| `DELETE` | Delete.                                               |

Upsert-style `POST /` endpoints (agent, workflow) are replaced by
`POST /` (create) plus `PATCH /:resourceId` (update). The client knows
whether it is creating or editing; the API should not guess from the body.

## Access control

- `authMiddleware` on every controller, unchanged.
- A new shared **workspace guard** runs on every `/workspace/:workspaceId/...`
  route. It generalizes `loadOwnedWorkspace()` from `document.service.ts`:
  load the workspace, verify `ownerId` matches the authenticated user, throw
  `NotFoundException` otherwise. Implemented once (middleware or shared
  service helper), never re-implemented per controller.
- After the guard passes, repos filter by `workspaceId`. The old pattern of
  filtering every query by `userId` is no longer the access mechanism.
- Resource tables keep their `userId` columns as **authorship metadata**
  (who created it), matching the `createdByUserId` pattern on documents.
  They are stamped on create and never used for access checks.
- When multi-user workspaces land, only the workspace guard changes
  (ownership check becomes membership check). Nothing else moves.

## Controller and service layering

Codifies the `document.controller.ts` style. Controllers are thin:

- **Controller** (`controllers/<resource>.controller.ts`): `basePath`,
  middlewares, validation, one service call per handler, return the response
  envelope. No `tryCatch`, no `logger`, no direct `@repo/database` imports,
  no business logic.
- **Service** (`services/<resource>.service.ts`): business logic, calls
  `@repo/database` repos, owns `tryCatch` + `logger.error`, throws the HTTP
  exceptions from `src/exceptions`. Helpers and interfaces live here.
- **Validation** (`middlewares/validationMiddlewares.ts`): zod schemas via
  `myzValidator`, exported as `valid<Thing><Kind>` (e.g.
  `validAgentIdParam`, `validCreateAgentBody`).

The older controllers (agent, workspace, chat, dataset, workflow,
social-post, imagegen) currently inline `tryCatch` + logging + exceptions.
They get service files as part of the migration.

## Response envelope

- **Single resource**: `{ <resource>: {...} }`, e.g. `{ agent: {...} }`.
  `201` on create, `200` otherwise.
- **List**: `{ <resource>s: [...], meta: {...} }`, plural key for the array,
  e.g. `{ agents: [...], meta: { totalCount: 42 } }`.
- **Delete**: `200` with `{ message: '<Resource> deleted successfully' }`
  (matches all existing controllers, keeps Hono RPC types simple).
- **Errors**: thrown exceptions only; the global `onError` in `app.ts`
  formats `{ code, error }`. Controllers and services never build error
  responses by hand.

## Pagination

Every list endpoint whose collection can grow unbounded implements the same
contract (agent, chat, workflow, social-post, document, dataset, gen-image,
notification):

- Query params: `page` (1-based, default `1`), `limit` (default `10`),
  `sort` (`asc` | `desc` by `createdAt`, default `desc`).
- Response: `meta: { totalCount }`. The count query must apply the exact
  same filters as the list query.
- Small, naturally bounded collections (folders, dataset rows within a
  dataset, workflow runs) may return everything, stated in the route's
  doc comment.

## Schema changes

On `agent`, `chat`, `genImage`, `socialPost`, `workflow`, `dataset`:

```ts
workspaceId: text('workspace_id')
  .notNull()
  .references(() => workspace.id, { onDelete: 'cascade' }),
```

(`document` and `folder` already look like this.)

- **Default workspace**: created in a better-auth `user.create` database
  hook, named "Personal". A one-off backfill script creates it for existing
  users and assigns every row with `workspaceId IS NULL` to its owner's
  default workspace, before the columns go `NOT NULL`.
- **Last workspace**: `DELETE /workspace/:workspaceId` returns `400` if it
  is the user's only workspace.
- Workspace delete warning in the UI changes from "items become unassigned"
  to "items in this workspace will be deleted".

## Frontend

- **Workspace scope store**: the discriminated union
  (`all | unassigned | workspace`) collapses to a single
  `activeWorkspaceId: string`, persisted in localStorage, falling back to
  the first workspace from the list. `listQuery`, `createWorkspaceId`, and
  the unassigned handling are deleted.
- **Switcher**: shows the user's workspaces plus "Manage workspaces".
  No "All items", no "Unassigned" entries.
- **API composables**: the `useDocumentApi.ts` pattern is the standard.
  One `use<Resource>Api.ts` per feature, workspaceId folded into every
  query key, `enabled` guards on the id, invalidation on mutation.
  Composables read the active workspace themselves via
  `useActiveWorkspaceId()` (`app/composables/useActiveWorkspaceId.ts`,
  wrapping `storeToRefs(useWorkspaceScopeStore()).activeWorkspaceId`)
  instead of taking `workspaceId` as a parameter. Earlier revisions of this
  migration threaded `workspaceId: MaybeRefOrGetter<string>` through every
  exported function and every call site had to pull it from the store via
  `storeToRefs` just to forward it along; since there is exactly one active
  workspace and no code path ever passes a different one, that was pure
  prop-drilling. Removed 2026-07-19 across all 8 `use<Resource>Api.ts`
  files and the sibling `use<Resource>List.ts` composables (`useAgentList`,
  `useChatList`, `useDatasetList`, `useSocialPostList`, `useWorkflowList`).
  No performance impact: Pinia stores are singletons (the store's setup
  function, including the `useLocalStorage` call, runs once regardless of
  how many composables call `useWorkspaceScopeStore()`), and `storeToRefs`
  returns a lightweight ref that delegates to the same reactive state, so
  reactivity/invalidation behavior is unchanged.
- Pages no longer need empty states for "no workspace selected": a
  workspace is always active.

## Side effects worth noting

- The known issue in
  [workspaces-known-issues.md](../workspaces/workspaces-known-issues.md)
  (agent-tool-created resources landing unassigned) resolves itself: tools
  run inside a chat, the chat has a required `workspaceId`, and tool-created
  resources inherit it.
- `docs/workspaces/workspaces.md` gets a supersession note pointing here.
  Its security-model sections stay accurate; only the optional-filter and
  three-state-view sections are obsolete.

## Work packages (big-bang migration)

The migration is split into packages so multiple agents can work in
parallel. Dependency graph:

```
WP0 database + auth foundation
 ├── WP1 API foundation ────┐
 └── WP2 web foundation ────┤
                            ├── WP3..WP9  vertical resource slices (parallel)
                            └── WP10      cleanup (last, after WP3..WP9)
```

WP1 and WP2 can run in parallel after WP0. WP3 to WP9 can all run in
parallel after WP1 and WP2. WP10 runs last.

### Parallelization rules

- **Each resource package owns disjoint files**: its controller, its
  `services/<resource>.service.ts`, its repos in `@repo/database`, its
  `src/validation/<resource>.schema.ts`, and its frontend
  `use<Resource>Api.ts` plus feature components and pages. No package edits
  another package's files.
- **Validation schemas move, not merge**: each resource package moves its
  own schemas out of `middlewares/validationMiddlewares.ts` (302 lines, the
  main conflict hotspot) into a new `src/validation/<resource>.schema.ts`,
  deleting them from the old file. WP10 removes the emptied file.
- **Shared files get append-only touches**: `app.ts` mounts,
  `validation/index.ts` and `repositories/index.ts` exports are one line
  per package. Conflicts there are trivial to resolve.
- After editing `@repo/database` sources, run
  `pnpm --filter @repo/database build` (the dev script does not watch
  package sources).
- Every package uses this PRD as its spec: route table, layering rules,
  envelope, and pagination contract above.

### WP0 — Database + auth foundation (blocks everything)

- `workspaceId` FK changes to `NOT NULL` + `cascade` on `agent`, `chat`,
  `genImage`, `socialPost`, `workflow`, `dataset`.
- Signup hook in `@repo/auth` (`databaseHooks` on user create) creating the
  "Personal" workspace.
- One-off backfill script: create "Personal" for existing users, assign all
  `workspaceId IS NULL` rows to their owner's default workspace, then flip
  the columns to `NOT NULL` via `db:push`.
- Workspace repo helper: count workspaces by owner (for the last-workspace
  rule in WP1).

### WP1 — API foundation

- Workspace guard: shared middleware for `/workspace/:workspaceId/...`
  routes, generalizing `loadOwnedWorkspace()`; validates the param, loads
  the workspace, 404s on non-ownership.
- `workspace.service.ts` extraction; thin workspace controller; `DELETE`
  rejects the last workspace with `400`.
- Workspace validation schemas move to `src/validation/workspace.schema.ts`
  (establishing the per-resource layout next to `pagination.schema.ts`).
- Remove the `unassigned` and `workspaceId` query schemas
  (`validWorkspaceScopedListQuery`, `validWorkspaceIdQuery`).

### WP2 — Web foundation

- `workspacescope.store.ts`: discriminated union collapses to
  `activeWorkspaceId: string` (localStorage, fallback to first workspace).
  `listQuery`, `createWorkspaceId`, and unassigned handling deleted.
- `WorkspaceSwitcher.vue`: workspaces + "Manage workspaces" only.
- `WorkspaceManageDialog.vue`: delete warning becomes "items in this
  workspace will be deleted"; surface the last-workspace `400`.

### WP3..WP9 — Vertical resource slices (parallel)

Each slice: nested routes per the route table, thin controller, service
extraction, repo queries scoped by `workspaceId`, validation schema file,
frontend composable + query keys + affected components and pages.

| WP  | Scope                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| WP3 | **Agent**: agent CRUD (upsert split into create + `PATCH`), memory, context documents (`/agent/:agentId/documents` → `.../context-document`). Largest slice. |
| WP4 | **Chat**: chat CRUD and message routes. WS streaming untouched.                                                                            |
| WP5 | **Dataset**: dataset CRUD + rows.                                                                                                          |
| WP6 | **Workflow**: workflow CRUD (upsert split), publish, runs nested under `/workflow/:workflowId/run` (run detail and cancel move under it).   |
| WP7 | **Social post**: CRUD, media, publish; `/social-posts` → `/workspace/:workspaceId/social-post`.                                            |
| WP8 | **Gen image**: `/image/generate` → `/workspace/:workspaceId/gen-image`; list is `GET /`, generate is `POST /`.                             |
| WP9 | **Documents + folders + aimodel**: plural → singular route renames; `GET /aimodel/list` → `GET /aimodel`. Smallest slice.                  |

### WP10 — Cleanup and docs (last)

- Delete the emptied `validationMiddlewares.ts`; grep for stale routes,
  `unassigned`, and leftover flat paths across api and web.
- Update `workspaces-known-issues.md` (tool-created resources issue is
  resolved by inheritance from the chat's workspace).
- Verify every mounted controller matches the route table in this PRD.

## Implementation status (2026-07-19)

WP0 through WP10 are implemented on `feat/api-standards-migration`.
`@repo/database`, `@repo/auth`, `@repo/ai`, the API app, and the worker all
build clean. Open items found during the migration, deliberately deferred:

- **Document list is not paginated** despite being in the pagination table
  above. `GET /workspace/:workspaceId/document` still returns a flat
  `{ documents }` and `useDocumentApi.ts` expects that shape. Needs a small
  coordinated backend + frontend change.
- **Notification routes predate the standard**: no `meta.totalCount`
  (returns an unread `count` instead) and still `:id` rather than
  `:notificationId`. Notifications were never part of a work package.
- **Dead partial index**: `agent_default_unassigned_idx`
  (`WHERE workspaceId IS NULL`) on `agent` can never match now. Removing it
  is a schema change plus `db:push`.
- **Envelope exceptions**: workflow publish/run-start validation failures
  and the LinkedIn "not connected" publish response build raw
  `{ code, error, ... }` bodies in the controller because the global
  `onError` only forwards thrown `HTTPException`s. Pre-existing pattern,
  kept intentionally; folding these into the error handler is a follow-up.
- **`tsx` is not a workspace devDependency**, so `db:seed` and the new
  `db:backfill-workspace` scripts only run via `pnpm dlx tsx`.

**Follow-up done (2026-07-19):** removed the `workspaceId` parameter
prop-drilling described in [Frontend](#frontend) above, across all API
composables, the sibling list composables, and ~40 call-site
pages/components. See that section for details.

## Out of scope

- Multi-user workspaces (membership, roles, invites). This standard is the
  seam that makes them additive: only the workspace guard changes.
- Moving resources between workspaces. Now that containers are hard
  boundaries and delete cascades, a "move to workspace" action is the
  natural fast-follow.
- Workspace-scoped notifications and websocket channel scoping.
- API versioning. Pre-production showcase app, no compatibility promises.
