# Media library migration: imagegen, videogen, social posts (PRD)

> **Status: implemented** (`feat: migrate to media library`, 2026-08-04).
> Phase 2 of specs/media-library/prd.md. All three producers migrated in one
> effort, gen-image input references became a link table, existing rows
> were backfilled by a one-off script (since removed). Agent context
> documents stay out permanently.

Every R2-backed object in imagegen, videogen, and social posts becomes a
`media` row, and every feature reference to one becomes an SQL-visible link
point. The payoff: the three hand-rolled "don't delete what you don't own"
policies (social's `deleteUploadedMediaObjects` origin filter, videogen's
`frameOrigin` split, imagegen's reference-origin split) collapse into the
single refcount rule from phase 1. Deleting a gen image whose object a
social post still uses keeps the object alive; deleting the last referrer
deletes it.

Ownership is uniform: all three tables already carry `workspaceId`, so all
migrated media is workspace-owned (`owner_workspace_id`), like chat
attachments.

## Goals

- `gen_images.media_id` (FK media, notNull) replaces `storage_key`.
- New `gen_image_reference` link table replaces the `reference_images`
  jsonb: (id, genImageId FK cascade, mediaId FK, origin, sortOrder). The
  jsonb column is dropped.
- `gen_videos.media_id` and `gen_videos.frame_media_id` (both nullable,
  the pending lifecycle means no object exists yet) replace `storage_key`
  and `frame_storage_key`.
- `social_post_media.media_id` (notNull) replaces `storage_key`.
- Refcount generalized in one place: `countChatAttachmentReferences`
  becomes `countMediaReferences`, and `findUnreferencedMediaOlderThan`
  counts the same union: chat_attachment, gen_images.media_id,
  gen_image_reference.media_id, gen_videos.media_id,
  gen_videos.frame_media_id, social_post_media.media_id.
- One-off backfill script creating media rows for every existing object
  (origin `generated` for gen outputs, `uploaded` for uploaded frames,
  references, and social uploads; reference rows of origin
  `genImage`/`agent` link to the referenced output's media row instead of
  creating a new one).
- Creation flows write media rows (API services and the gen-video worker
  processor); deletion flows delete their rows/links, then
  `deleteMediaIfUnreferenced` per touched mediaId.
- External API DTOs unchanged; zero frontend changes.

## Non-goals

- Agent context documents (permanent exclusion; chunk/embedding lifecycle).
- Moving R2 objects. Keys stay exactly where they are; `media.storage_key`
  records the legacy layout and the existing key builders keep being used
  for new objects. The `<ownerId>`-based layout from phase 1 remains a
  chat-attachment convention only.
- Dropping the feature-level origin fields (`GenImageReference.origin`,
  `frameOrigin`, social's `origin`). They stay as provenance metadata and
  DTO fields; they just no longer drive deletion policy.
- "My media" UI, quotas, model gating (unchanged from phase 1).

## Design decisions

1. **Link points are FK columns on the feature rows**, not a generic join
   table: `gen_images.media_id`, `gen_videos.media_id`/`frame_media_id`,
   `social_post_media.media_id`, plus the one real link table
   `gen_image_reference` (references are a list per gen image, jsonb can't
   hold FKs, and refcount must see them — the decision from the
   discussion). All new FKs to `media.id` carry no onDelete action, same
   as `chat_attachment.media_id`: the DB itself refuses to delete
   referenced media. All registered in `relations.ts`.

2. **Two-phase push with the backfill in between.** `db:push` is
   destructive on dropped columns, so: phase 1 push adds the nullable
   `media_id` columns and `gen_image_reference` (nothing dropped);
   the backfill script runs; phase 2 push drops `storage_key`,
   `frame_storage_key`, `reference_images` and tightens
   `gen_images.media_id` / `social_post_media.media_id` to notNull.
   The schema file ends at the phase-2 state; phase 1 exists only as the
   intermediate push during migration.

3. **Backfill script** in `packages/database/scripts/backfill-media.ts`
   (package script `backfill:media`), idempotent (skips rows that already
   have a mediaId). Per row: create a media row with
   `owner_workspace_id = row.workspaceId`, the existing storage key,
   bucket = images bucket (all three features store there), mime type
   inferred from the key extension (mp4 for video outputs), origin per the
   mapping above. `size` comes from a HEAD on the object; a missing object
   logs and writes size 0 (the row was already pointing at nothing).
   Reference entries resolve `genImage`/`agent` origins to the referenced
   gen image's new media row by storage key; unresolvable ones are logged
   and skipped.

4. **Refcount stays in one query.** `countMediaReferences` and
   `findUnreferencedMediaOlderThan` are the only two places that know the
   link-point list (phase 1's rule). The sweep cron and
   `deleteMediaIfUnreferenced` are unchanged consumers.

5. **Deletion flows swap policy for refcount.** `deleteGenImage`: delete
   the row (its reference links cascade), then `deleteMediaIfUnreferenced`
   for the output media and each referenced media. Social post / media
   deletion: collect mediaIds, delete rows, refcount each;
   `deleteUploadedMediaObjects` is retired. Videogen mirrors imagegen.
   Workspace deletion already handles owned media via phase 1.

6. **Creation flows.** API services create the object with the existing
   key builders, then a media row (via `createMedia`), then the feature
   row pointing at it. The gen-video worker processor does the same on
   completion using `createMedia` from `@repo/database` directly (workers
   can't import API services). URL building everywhere switches to
   `buildImageUrls({ key: media.storageKey })` off the joined media row.
