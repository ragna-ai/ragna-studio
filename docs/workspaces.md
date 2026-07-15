# Workspaces

User-specific workspaces let a single user organize their own resources (agents, chats, workflows, generated images, social posts) into named buckets. A workspace is a **private, organizational overlay** on top of a user's data, not a shared multi-tenant boundary.

This PRD describes **v1**, the minimal functional core: a `workspace` table, an optional `workspaceId` on scoped resources, a workspace switcher in the UI, and optional filtering of list views. Collaboration, roles, invites, and moving items between workspaces are explicitly out of scope for v1.

## Core principle

`userId` remains the **security boundary** on every table, exactly as it is today. A workspace never changes who owns or can access a row. It is purely a client-driven **view filter** scoped within a single user's own data.

Consequences:

- No membership tables, no roles, no invitations.
- No auth changes. The better-auth `admin` plugin and all existing `userId` filters stay untouched.
- Cascade deletes, repositories, controllers, and worker jobs keep working as-is.
- If the workspace filter is ever missing or wrong, **no data leaks**, because `userId` already fences every query. The workspace is a view, not a wall.

## Design decisions

These are settled. Do not re-open them.

| Decision                  | Choice                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Model**                 | **Private, single-user.** Each workspace belongs to exactly one user. No sharing, no membership.                                                  |
| **Owner column**          | The `workspace` table uses `ownerId` (not `userId`) to name the creating user. This is intentional prep: a future `workspace_users` pivot can add members without renaming this column. Scoped resource tables keep `userId` unchanged. |
| **Security boundary**     | Stays `userId`. `workspaceId` is never a substitute for `userId` in any query.                                                                    |
| **`workspaceId` nullability** | **Nullable.** `null` means "unassigned". Workspaces are purely optional buckets on top of a user's data.                                       |
| **Default workspace**     | None auto-created. The baseline is "All items" (the unfiltered `userId` view). Workspaces are opt-in.                                             |
| **List views**            | **Three states.** *All items* = everything (no filter, the default). *A workspace* = that workspace's items. *Unassigned* = only `workspaceId IS NULL`. All + Unassigned are distinct: "All items" is the union view (like Gmail's "All Mail"), "Unassigned" is the unfiled bucket. |
| **Active workspace**      | **Client state.** Modeled as a discriminated union `{ kind: 'all' \| 'unassigned' \| 'workspace', workspaceId? }`. Translated to query params per the states above. Not persisted in the session.        |
| **Moving items**          | **Out of scope for v1.** Items are stamped with the active `workspaceId` at creation time only. A "move to workspace" action may come later.      |
| **Notifications**         | **Stay user-global.** Not workspace-scoped.                                                                                                        |
| **Worker / DTOs**         | **Untouched.** Jobs run on `userId`; workspace is irrelevant to execution.                                                                        |
| **Global resources**      | `aiModel` and `agentTemplate` remain global (no `userId`, no `workspaceId`).                                                                       |

## Scoped resources

The following top-level tables gain a nullable `workspaceId`:

- `agent`
- `chat`
- `genImage`
- `socialPost`
- `workflow`

Child tables inherit their parent's workspace implicitly and are **not** changed: `chatMessage`, `workflowRun`, `workflowRunStep`, `agentMemory`, `socialPostMedia`.

## Schema

New file `packages/database/src/schema/workspace.schema.ts`:

```ts
import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';

export const workspace = pgTable(
  'workspaces',
  {
    id: primaryIdColumn,
    // Named `ownerId` (not `userId`) to signal one owner now, and to leave room
    // for a future `workspace_users` pivot without renaming this column.
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [index('workspace_ownerId_idx').on(table.ownerId)],
);

export type Workspace = typeof workspace.$inferSelect;
export type NewWorkspace = typeof workspace.$inferInsert;
```

Each scoped table gains one nullable column. `onDelete: 'set null'` so deleting a workspace does not delete the resources inside it, they just fall back to "unassigned":

```ts
workspaceId: text('workspace_id').references(() => workspace.id, {
  onDelete: 'set null',
}),
```

Add a matching index on each scoped table, e.g. `index('agent_workspaceId_idx').on(table.workspaceId)`.

### Registration

Per repo convention, register `workspace` in `packages/database/src/schema/relations.ts`:

- Add `workspace` to the `schema` object.
- Add `user.workspaces: r.many.workspace()`.
- Add `workspace.owner: r.one.user({ from: workspace.ownerId, to: user.id, optional: false })`.
- Add a `workspace: r.one.workspace(...)` relation (optional) to each scoped table (`agent`, `chat`, `genImage`, `socialPost`, `workflow`), and the inverse `workspace.<resource>s: r.many.<resource>()`.

Export `workspace` from `packages/database/src/schema/index.ts`.

Schema is applied with `db:push` (pre-production, no SQL migrations, no backfill).

## Repository layer

Add `workspace.repo.ts` with the standard CRUD scoped by `ownerId`:

- `create({ ownerId, name })`
- `findManyByOwner(ownerId)`
- `findById(id, ownerId)` — always filtered by `ownerId`
- `update(id, ownerId, { name })`
- `delete(id, ownerId)` — DB sets `workspaceId` to null on affected resources

Note: only the `workspace` table uses `ownerId`. The scoped resource tables keep their existing `userId` unchanged.

Register it in `packages/database/src/repositories/index.ts`.

### Filtering existing list repos

Each scoped list query keeps its `userId` filter and adds **one optional** clause:

```ts
// pseudo: existing filter stays, workspace filter is additive and optional
where(and(eq(table.userId, userId), workspaceId ? eq(table.workspaceId, workspaceId) : undefined));
```

Passing no `workspaceId` returns the full "All items" view. Affected list repos: `agent`, `chat`, `gen-image`, `social-post`, `workflow`.

**Pagination counts must apply the same filter.** The `*CountByUserId` functions (`agent`, `chat`, `social-post`, `workflow`) power pagination totals. They take the same optional `workspaceId` and apply the identical additive filter, otherwise a filtered list would be paginated against an unfiltered total (wrong page count, phantom pages). `gen-image` has no paginated count. Notification counts stay user-global.

## API layer

- New workspace controller/routes: `list`, `create`, `rename`, `delete`. All scoped to the authenticated `userId`.
- Existing list endpoints for scoped resources accept two optional query params that resolve to three states: neither = **All items**; `workspaceId=<uuid>` = **that workspace**; `unassigned=true` = **only `workspaceId IS NULL`**. `unassigned` takes precedence if both are sent. In repos, "unassigned" uses the relational filter `{ workspaceId: { isNull: true } }` (or `isNull(table.workspaceId)` in count/SQL-builder queries). Both the list and the pagination-count query must apply the same state.
- Existing create endpoints accept an **optional** `workspaceId` in the body and stamp it onto the new row. Absent = `null` (unassigned).

No endpoint changes its authorization logic. `userId` still gates everything.

### Gen-image layering (related refactor)

Generated images did not follow the other resources' controller → `@repo/database` path: the imagegen controller went through `@repo/ai`, which owned generation *and* persistence/listing. Adding workspace support surfaced that a pure DB read (`getGenImagesForUser`, no AI) lived in `@repo/ai`. It was re-homed:

- **Read/list** (`getGenImagesForUser`) moved to `apps/api/src/services/imagegen.service.ts`, calling `@repo/database` directly.
- **R2 key/URL helpers** (`buildImageUrls`, `getImgGenBucketNameForUser`) moved to `@repo/storage` as the single source of truth, shared by the list service and the create pipeline.
- **Generate pipeline** (`createGenImages`, `createGenImagesWithDefaultModel`) stays in `@repo/ai` because the chat agent's image tool (in `@repo/ai`) needs it mid-stream and cannot depend on `apps/api`.

## Frontend

- **Workspace switcher**: lists "All items" and "Unassigned" (the two global views, grouped at the top), then the user's workspaces, then "Manage workspaces". Selection is stored in client state as a discriminated union.
- **List views**: the active selection resolves to query params, All → none, a workspace → `workspaceId`, Unassigned → `unassigned=true`. The selection key is folded into the query keys so switching refetches.
- **Create flows**: new items inherit the active `workspaceId` only when a specific workspace is active. Both "All items" and "Unassigned" create as unassigned (no `workspaceId` sent). Upsert-based resources stamp the workspace on create only, never on edit.
- **Workspace management UI**: create, rename, delete a workspace. Deleting warns that contained items become unassigned (not deleted).

## Out of scope for v1

- Sharing workspaces / multi-user membership, roles, invitations.
- Moving items between workspaces after creation.
- Per-workspace default agent, settings, or theming.
- Workspace-scoped notifications.
- Persisting the active workspace server-side (session/DB).
- Backfilling existing rows into a default workspace.

## Rejected alternatives

- **Polymorphic `workspace_item` join table** (`workspaceId`, `resourceType`, `resourceId`). Considered to avoid touching each scoped table. Rejected: `resourceId` points at different tables, so no real foreign key is possible. That means no `onDelete` integrity, so every resource delete path would have to manually clean up mapping rows or leak orphans; `resourceType` becomes an unvalidated free string; list queries need extra joins; and it does not fit the repo's `defineRelations` graph. A join table earns its keep for many-to-many or an open-ended type set. Our case is one-to-many (an item lives in at most one workspace) over a small, stable set of ~5 resource types, so a nullable `workspaceId` column is both leaner and safer.

## Future phases (not built here)

- **Move items**: a "move to workspace" action (bulk and single) on scoped resources.
- **Shared workspaces**: promote to a multi-user model via a `workspace_users` pivot table (owner + members with roles), or the better-auth organization plugin (members, roles, invites, active-org-in-session). The `ownerId` naming on `workspace` is the seam that makes this additive rather than a rename. This would change the security boundary and is a separate, larger effort.
