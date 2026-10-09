DROP INDEX "agent_default_per_workspace_idx";--> statement-breakpoint
DROP INDEX "agent_default_unassigned_idx";--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "triggered_by_user_id" text;--> statement-breakpoint
ALTER TABLE "datasets" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gen_images" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gen_videos" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_default_workspace_idx" ON "agents" ("workspace_id") WHERE "is_default";--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_triggered_by_user_id_users_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_user_id_users_id_fkey", ADD CONSTRAINT "agents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "datasets" DROP CONSTRAINT "datasets_user_id_users_id_fkey", ADD CONSTRAINT "datasets_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "gen_images" DROP CONSTRAINT "gen_images_user_id_users_id_fkey", ADD CONSTRAINT "gen_images_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "gen_videos" DROP CONSTRAINT "gen_videos_user_id_users_id_fkey", ADD CONSTRAINT "gen_videos_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "social_posts" DROP CONSTRAINT "social_posts_user_id_users_id_fkey", ADD CONSTRAINT "social_posts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_user_id_users_id_fkey", ADD CONSTRAINT "workflows_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;