ALTER TABLE "media" ADD COLUMN "text_extraction_status" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "extracted_text_truncated" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Existing task attachments of an extractable type start as pending. The worker sweep queues them.
UPDATE "media"
SET "text_extraction_status" = 'pending'
WHERE "mime_type" IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'text/markdown'
  )
  AND "id" IN (SELECT "media_id" FROM "task_attachments");
