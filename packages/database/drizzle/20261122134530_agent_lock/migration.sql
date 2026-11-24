CREATE TABLE "agent_versions" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"agent_id" text,
	"version_number" integer NOT NULL,
	"config" jsonb NOT NULL,
	"knowledge_document_ids" text[] NOT NULL,
	"locked_by_user_id" text,
	"locked_at" timestamp(3) NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp(3),
	"revoked_by_user_id" text,
	"revoked_at" timestamp(3),
	"unlocked_by_user_id" text,
	"unlocked_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "agent_versions_workspace_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "locked_version_id" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "agent_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "agentVersion_workspaceId_idx" ON "agent_versions" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agentVersion_agentId_versionNumber_idx" ON "agent_versions" ("agent_id","version_number");--> statement-breakpoint
CREATE INDEX "workflow_agentIds_idx" ON "workflows" USING gin ("agent_ids");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_locked_version_workspace_fk" FOREIGN KEY ("workspace_id","locked_version_id") REFERENCES "agent_versions"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_locked_by_user_id_users_id_fkey" FOREIGN KEY ("locked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_approved_by_user_id_users_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_revoked_by_user_id_users_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_unlocked_by_user_id_users_id_fkey" FOREIGN KEY ("unlocked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;