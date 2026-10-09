CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "workspaceMember_role_check" CHECK ("role" IN ('manager', 'editor'))
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "visibility" text DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "personal_user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_personalUserId_unique" ON "workspaces" ("personal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaceMember_workspaceId_userId_unique" ON "workspace_members" ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspaceMember_userId_idx" ON "workspace_members" ("user_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_personal_user_id_users_id_fkey" FOREIGN KEY ("personal_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspace_visibility_check" CHECK ("visibility" IN ('personal', 'organization', 'restricted'));--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspace_personal_user_check" CHECK (("visibility" = 'personal') = ("personal_user_id" IS NOT NULL));