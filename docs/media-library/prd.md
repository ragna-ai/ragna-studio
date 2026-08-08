# Media library + chat attachments (PRD)

> **Status: implemented** (merged via PR #15, `feat: media library core +
> chat attachments`, 2026-08-04). FK composition over polymorphism,
> refcount deletion, v1 scope was the media core plus chat attachments
> only, as decided with Sven.

A central, owner-scoped `media` table becomes the single record of every
file in R2. The owner decides the access chain: user-owned media is
personal (user → media), workspace-owned media is reachable by every
workspace member (user → workspace → media), and organization-owned media
(once an organizations table exists) by every org member (org → media).
Chats are workspace containers, so chat attachments are workspace-owned
and v1 writes only `owner_workspace_id`. Today the "DB row + storageKey + best-effort R2 delete" pattern exists
four times (imagegen, videogen, social-post-media, agent context documents),
each with its own validation, key layout, URL building, and cleanup. Chat
attachments would have been the fifth copy; instead they become the first
consumer of the shared media core.

The user-facing feature: attach files to a chat message via drag-n-drop,
clipboard paste, or a paperclip button. Images and PDFs go to the model
natively as file parts. Word, Excel, and plain-text formats are extracted to
text at upload and injected as text blocks. Deleting a chat deletes its
attachments' files, unless a file is still referenced elsewhere.

## Goals

- `media` table: the file record (owner, bucket, storage key, mime type,
  size, origin, extracted text). Feature tables link to it with real FKs.
  Registered in `packages/database/src/schema/relations.ts` (house rule:
  a table missing from the relations graph throws at runtime).
- `chat_attachment` link table (`chatId`, `mediaId`). Chat deletion removes
  the links; media with zero remaining references is deleted, DB row and R2
  object both.
- `media.service.ts` in `apps/api` owning upload validation (content
  sniffing, never client mime), storage, URL building, and refcounted
  deletion. `@repo/storage` stays the dumb byte layer.
- Worker sweep cron as a safety net: deletes media that has had zero
  references for more than 24 h (covers races and failed best-effort R2
  deletes).
- Chat input: drop zone, paste, and file picker share one code path. Eager
  upload on drop with a pending thumbnail/chip strip above the textarea,
  per-item remove. Send attaches `file` parts to the user message.
- Accepted types, 10 MB per file: png/jpeg/webp images, pdf, docx, xlsx,
  txt, md, csv.
- Model input in two tiers: images and PDF pass through
  `convertToModelMessages` natively; docx/xlsx/txt/md/csv are swapped for
  their extracted text when the server builds model messages.

## Non-goals

- Migrating imagegen, videogen, social-post-media, or agent context
  documents onto the media core. Imagegen/videogen outputs (`origin:
  'generated'`) are the intended next consumer, in a follow-up. Agent
  context documents may never migrate; their chunk/embedding lifecycle is a
  poor fit.
- A "My media" library page. The table is the library; the UI comes once
  generated media lives in it too.
- Model capability gating. A non-vision model simply gets the file part and
  may error; `ai_models.capabilities` gating is a later enhancement.
- Thumbnails or image conversions. The public image CDN serves originals.
- pptx (needs a new parser, low value) and any other type not listed above.
- Quotas and storage accounting (repo-wide: design for, ship later;
  `media.size` summed per owner is the hook).
- User-owned (personal library) or organization-owned media. The owner
  columns and access flows are defined, but every v1 upload sets
  `owner_workspace_id`.
- Attachment download UI for documents beyond a plain download route.

## Design decisions

1. **FK composition, not Spatie-style polymorphism.** A
   `mediable_type`/`mediable_id` pair has no real FK, no cascade, and no
   place in the `defineRelations` graph. Instead every consumer gets a
   normal link table or FK column pointing at `media.id`. v1 ships one:
   `chat_attachment`.

   The same rule applies to the owner side: no `owner_type`/`owner_id`
   pair. Ownership is a set of nullable FK columns with a check constraint
   that exactly one is set, and the set column selects the access flow:
   `owner_user_id` is personal media (that user only),
   `owner_workspace_id` is workspace media (access via membership),
   `owner_organization_id` (added once an organizations table exists) is
   org media. Real FKs keep cascade and the relations graph; owner
   deletion only has to clean up R2 objects, the rows go by themselves
   (decision 2). Chat access is workspace-scoped (`getChatForWorkspace`
   has no user filter, any member opens any chat), so chat attachments
   are workspace-owned and v1 only ever writes `owner_workspace_id`.

   ```
   media
     id            (pk)
     owner_user_id      (fk users, cascade)     | null
     owner_workspace_id (fk workspace, cascade) | null
     -- check: exactly one owner_* column set; v1 writes only owner_workspace_id
     bucket        text          -- cfImagesBucketName | cfDocumentsBucketName
     storage_key   text
     filename      text
     mime_type     text
     size          integer       -- bytes
     origin        text          -- 'uploaded' | 'generated' (v1 writes only 'uploaded')
     extracted_text text | null  -- tier-2 docs only, capped
     created_at

   chat_attachment
     id            (pk)
     chat_id       (fk chat, cascade)
     media_id      (fk media)
     created_at
   ```

2. **Refcount deletion with a sweep.** Deletion is driven by DB rows, never
   by key prefixes. `media.service.ts` exposes
   `deleteMediaIfUnreferenced(mediaId)`: counts remaining link rows, and at
   zero deletes the R2 object (best-effort, logged like
   `deleteAgentContextDocumentObjects`) plus the media row. Called from
   every detach point: chat delete (after the `chat_attachment` rows are
   read), and the remove-pending-attachment endpoint. The worker cron
   re-runs the same check for media with no links older than 24 h. Every
   future consumer must add its link table to the refcount query; the
   function is the single place to do it.

   Owner deletion is the other cleanup path: deleting a workspace must
   delete its owned media R2 objects (same best-effort pattern) before the
   FK cascade wipes the media rows, or the objects orphan invisibly.

3. **Two buckets by type, media-scoped keys.** Images go to
   `cfImagesBucketName` under `<ownerId>/images/chat-uploads/<mediaId>` so
   the existing public CDN (`buildImageUrls`, `https://images.ragna.io/…`)
   renders them in the UI and serves them to vision models by URL.
   Everything else goes to the private `cfDocumentsBucketName` under
   `<ownerId>/media/<mediaId>`. `<ownerId>` is whichever owner FK is set
   (a workspace id in v1). Keys carry no chatId: deletion is row-driven
   (decision 2), and a library file is not owned by one chat.

4. **Eager chat creation.** The upload endpoint is
   `POST /workspace/:workspaceId/chat/:chatId/attachments` (multipart
   `files` field, mirroring the agent-context-document upload), so a chat id
   must exist at drop time. `ChatConversation.vue` moves its lazy
   `createNewChat` call from `handleSubmit` into a shared "ensure chat"
   helper that the drop/paste/picker path calls first. The endpoint
   validates (size, sniffed type), stores to R2, extracts text for tier-2
   types, and returns `{ id, mediaId, filename, mediaType, url }` per file.
   `DELETE …/attachments/:attachmentId` removes a pending item (detach,
   then `deleteMediaIfUnreferenced`).

5. **File parts carry URLs; the server maps them back to media.** On send,
   the client passes the uploaded files to `sendMessage` so the user
   message gets AI SDK `file` parts (`{ type: 'file', mediaType, url,
   filename }`). Image parts use the public `imgUrl`; document parts use
   the API download route `GET /media/:mediaId/download` (auth: owner
   access check per the flow in decision 1, in v1 membership of the owning
   workspace, the same guard the chat routes use; streams from R2). When `chat.service.ts` builds model messages it
   resolves each file part to its media row via the mediaId in the URL,
   verified against `chat_attachment` for the chat:
   - **image**: pass through, the public URL is model-fetchable.
   - **pdf**: download the bytes from R2 and inline them; the documents
     bucket is private, so no URL would work.
   - **docx/xlsx/txt/md/csv**: replace the part with a text block,
     `<attached-file name="report.xlsx">…extracted text…</attached-file>`.
   The persisted UIMessage keeps the original file part either way, so the
   UI renders chips/images from history unchanged.

6. **Sync extraction at upload.** No worker job: the user sends seconds
   after dropping, and a "still parsing" state plus the send race isn't
   worth it for files this small. `extractDocumentText` in `@repo/storage`
   already covers pdf, docx (mammoth), txt, md; it gains xlsx
   (`read-excel-file`, per the lib comparison in
   docs/datasets/export-and-row-reorder.md decision 3; exceljs and SheetJS
   are rejected there. Each sheet rendered as CSV under a `## <sheet
   name>` heading) and
   csv (UTF-8 passthrough). The sniffing in `extract.service.ts` gains
   image magic bytes, xlsx (ZIP magic + `.xlsx` extension, same
   disambiguation trick as docx), and csv. Extracted text is capped at
   50 000 chars with a trailing `[truncated]` marker before it is stored.

7. **One `handleFiles()` path in the chat input.** VueUse `useDropZone` on
   the conversation container (full-area overlay while dragging), a paste
   handler on the textarea reading `clipboardData.files`, and a paperclip
   button with a hidden `<input type="file" multiple>` all feed the same
   function: ensure chat, upload eagerly (spinner on the pending item),
   collect results. Pending items render above the textarea as image
   thumbnails or filename chips with a remove button. Submit requires text
   or at least one finished upload; in-flight uploads block submit.

## Open questions

- Exact extracted-text cap (50k chars proposed) and sweep age (24 h
  proposed); both are one-line constants.
- Whether the send should also attach `messageId` to `chat_attachment`
  rows for per-message granularity later. Skipped in v1; chat-level
  granularity matches the deletion requirement.
