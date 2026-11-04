ALTER TABLE "email_accounts" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "email_accounts" ALTER COLUMN "integration_id" SET NOT NULL;