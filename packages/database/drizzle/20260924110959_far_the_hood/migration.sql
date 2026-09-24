ALTER TABLE "email_messages" ADD COLUMN "folder" text DEFAULT 'inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ALTER COLUMN "provider" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "emailMessage_accountId_folder_idx" ON "email_messages" ("account_id","folder");