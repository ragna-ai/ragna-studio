# Deletion and retention standard

Status: proposed (2026-10-24). Mechanism agreed, details below not yet reviewed.

How RAGNA Studio deletes data, how long deleted data lives, and how it is erased for good.

## Problem

- The shared `timestamps` helper (`packages/database/src/schema/common.schema.ts`) adds
  `deleted_at` to 18 tables. Only organizations and users use it (30-day soft delete, see
  [organizations v2](../../organizations/v2-prd.md)). Every other table is hard-deleted, and its
  `deleted_at` is always null. A reader can't tell which tables soft-delete.
- A hard delete is gone for good. There's no way to recover a row deleted by mistake or by a bug.
- 67 FKs cascade on delete. A soft delete never fires them, so mixing soft delete into a
  cascading table leaves live children under a deleted parent.
- GDPR: a soft-deleted row is not erased. Erasure must finish within one month of a request
  (Art. 12(3)) and reach every copy.

## Decisions

Discussed 2026-10-24.

| #   | Decision                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hybrid model.** The default is a real `DELETE`. A Postgres trigger copies the row into `deleted_record`. A table gets a user-facing trash only when its feature decides so. |
| 2   | **`deleted_at` stays in the shared `timestamps` helper.** Giving a table a trash needs no schema change. The column is inert until the table is registered as trashable.      |
| 3   | **No column drops** for tables that don't use `deleted_at`.                                                                                                                   |
| 4   | **30-day window, hard-coded.** Applies to trash and to `deleted_record`. A per-organization setting may come later.                                                           |
| 5   | **Which resources get a trash is not part of this standard.** Each feature decides it in its own PRD, through the [checklist](../README.md#checklist-for-every-feature-prd).  |

## Default: hard delete plus `deleted_record`

Code deletes with a plain `DELETE`. Queries need no filter, and FK cascades keep working.

```sql
CREATE TABLE deleted_record (
  id              text PRIMARY KEY,
  table_name      text NOT NULL,
  object_id       text NOT NULL,
  organization_id text,
  workspace_id    text,
  user_id         text,
  data            jsonb NOT NULL,
  deleted_at      timestamp(3) NOT NULL DEFAULT now()
);
```

- One generic trigger function, `deleted_record_insert()`, runs `AFTER DELETE ... FOR EACH ROW`.
  It stores `to_jsonb(OLD)` and copies `organization_id`, `workspace_id` and `user_id` out of
  the row when the table has them. Those columns let purge find a tenant's or a user's records.
- The row is stored as JSONB, so it survives later schema changes of the source table.
- No FKs on `deleted_record`. It must outlive the rows it copies.
- Row triggers also fire for rows removed by an FK cascade. Deleting a workspace records its
  documents, tasks and so on.
- Restore is a manual admin job (a runbook with SQL). It is not a product feature.
- The table and the trigger function ship as a custom migration
  (`drizzle-kit generate --custom`), because Drizzle's schema has no triggers. The table is
  registered in `relations.ts` like every other table.

### Which tables get the trigger

Tables that hold content a user wrote or configured. Not:

- derived data that can be rebuilt (`agent_context_document_chunk` with its embeddings),
- data synced from an external system (the email index),
- logs and short-lived rows (sessions, verifications, notifications, MCP tool calls),
- the credit ledger, which is never deleted.

A new table answers this in its PRD. The list of attached tables lives in one place in
`@repo/database`, next to the schema.

## Opt-in: user-facing trash

For tables whose feature PRD decides on a trash.

- **Soft delete** sets `deleted_at`. Only the parent row. Children stay untouched and are hidden
  through their parent.
- **Reads** go through a `notDeleted(table)` helper in `@repo/database`. Relational queries
  filter with `deletedAt: { isNull: true }`. A child read by its own id (a task attachment, a
  dataset row) checks its parent's `deleted_at` or goes through the resource guard.
- **Unique indexes** on a trashable table are partial: `WHERE deleted_at IS NULL`.
- **Side effects stop at soft delete**: schedules, queued jobs, public links. Each feature PRD
  lists its own.
- **Restore** clears `deleted_at` within 30 days. If a unique value was reused meanwhile,
  restore fails with a clear error.
- **API**: `DELETE` moves to trash. `POST .../:id/restore` restores. `GET .../trash` lists the
  trash. Final routes are fixed in the first feature PRD that uses trash.
- **Registry**: trashable tables are listed in one place in `@repo/database`. The soft-delete
  and restore helpers accept only registered tables (checked by type). A table outside the
  registry never has a non-null `deleted_at`.

## Purge

The existing daily `purge` cron (`apps/worker/src/crons/purge.cron.ts`,
`purgeExpiredDeletions` in `@repo/media`) already hard-deletes organizations and users after 30
days, R2 objects first. It grows two steps:

1. **Trash**: hard-delete rows of registered tables whose `deleted_at` is older than 30 days.
   R2 objects of those rows go first, as for organizations.
2. **`deleted_record`**: delete records older than 30 days.

A final purge must not copy rows back into `deleted_record`. That would keep personal data for
another 30 days. Purge sets a transaction-local flag
(`SET LOCAL ragna.skip_deleted_record = 'on'`) that the trigger checks.

The 30-day value is one shared constant (today `RECOVERY_WINDOW_DAYS` in `purge.service.ts`).

## Erasure (GDPR)

- **User purge** also deletes `deleted_record` rows with that `user_id`.
- **Organization purge** also deletes `deleted_record` rows of the organization and of its
  workspaces.
- **Worst case**: data a user deletes is gone from the database after 30 days in
  `deleted_record`, or after 30 days in trash. A user or organization deletion adds its own
  30-day window, and the final purge skips `deleted_record`. Erasure therefore finishes within
  one month of the request, before backups.
- **Backups**: deleted data ages out of backups on the backup rotation. The rotation must be
  bounded and documented.
- **Outside Postgres**: R2 objects are deleted by purge. Logs and Redis are out of scope here.

## Enforcement

- The trashable registry types the soft-delete, restore and `notDeleted` helpers.
- API tests per trashable resource: a trashed row is absent from list, get and search, and
  restore brings it back.
- A database test asserts the trigger exists on every table in the `deleted_record` list.
- Purge tests: expired trash and records are removed, the skip flag leaves no new
  `deleted_record` rows.

## Migration path

- Existing tables keep `deleted_at`. Nothing is dropped.
- Organizations and users already follow the trash pattern. They move into the registry
  without behavior change.
- The trigger starts recording from the migration on. Earlier deletes are not recoverable.

## Open questions

| Question                                                                                                 | Answer |
| -------------------------------------------------------------------------------------------------------- | ------ |
| What is the production backup rotation? The privacy docs must state it.                                  |        |
| Confirm the initial `deleted_record` table list (content tables, exclusions above).                      |        |
| Do Relations v2 predefined `where` filters cover `notDeleted` in relational queries?                     |        |
| The agent soft delete issue (#179) plans no purge. This standard purges trash after 30 days. Which wins? |        |

## Out of scope

- Which resources get a trash (one later session, then per feature PRD).
- A per-organization retention setting.
- A restore UI for `deleted_record`.
- Retention of application logs and Redis data.
