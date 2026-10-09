DROP INDEX "member_userId_idx";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deleted_at" timestamp;