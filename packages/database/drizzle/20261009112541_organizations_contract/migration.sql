ALTER TABLE "credit_accounts" DROP CONSTRAINT "credit_accounts_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_owner_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "credit_accounts" DROP CONSTRAINT "credit_accounts_user_id_key";--> statement-breakpoint
DROP INDEX "workspace_ownerId_idx";--> statement-breakpoint
ALTER TABLE "credit_accounts" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "credit_accounts" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "organization_id" SET NOT NULL;