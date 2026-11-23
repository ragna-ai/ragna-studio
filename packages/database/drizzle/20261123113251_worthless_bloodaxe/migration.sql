CREATE TYPE "task_comment_author_kind" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"author_kind" "task_comment_author_kind" NOT NULL,
	"author_user_id" text,
	"author_agent_id" text,
	"body" text NOT NULL,
	"edited_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3),
	CONSTRAINT "taskComment_author_kind_check" CHECK (("author_kind" = 'user' AND "author_agent_id" IS NULL) OR ("author_kind" = 'agent' AND "author_user_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "taskComment_taskId_createdAt_idx" ON "task_comments" ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_users_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_workspace_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "tasks"("workspace_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_agent_workspace_fk" FOREIGN KEY ("workspace_id","author_agent_id") REFERENCES "agents"("workspace_id","id");