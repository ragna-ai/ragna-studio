CREATE TYPE "task_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"agent_id" text,
	"started_by_user_id" text,
	"status" "task_run_status" DEFAULT 'queued'::"task_run_status" NOT NULL,
	"outcome" text,
	"previous_task_status" text NOT NULL,
	"agent_version_id" text NOT NULL,
	"trace" jsonb DEFAULT '[]' NOT NULL,
	"first_write_at" timestamp(3),
	"usage" jsonb DEFAULT '{"inputTokens":0,"outputTokens":0,"credits":0}' NOT NULL,
	"error" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"started_at" timestamp(3),
	"finished_at" timestamp(3),
	CONSTRAINT "task_runs_workspace_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "task_comments" ADD COLUMN "task_run_id" text;--> statement-breakpoint
CREATE INDEX "taskComment_taskRunId_idx" ON "task_comments" ("task_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taskRun_taskId_active_idx" ON "task_runs" ("task_id") WHERE "status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "taskRun_workspaceId_status_idx" ON "task_runs" ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "taskRun_taskId_createdAt_idx" ON "task_runs" ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_run_id_task_runs_id_fkey" FOREIGN KEY ("task_run_id") REFERENCES "task_runs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_started_by_user_id_users_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_task_workspace_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "tasks"("workspace_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_agent_workspace_fk" FOREIGN KEY ("workspace_id","agent_id") REFERENCES "agents"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_agent_version_workspace_fk" FOREIGN KEY ("workspace_id","agent_version_id") REFERENCES "agent_versions"("workspace_id","id");