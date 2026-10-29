CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"created_by_user_id" text,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"external_email" text,
	"display_name" text,
	"scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp(3),
	"status" text DEFAULT 'active' NOT NULL,
	"auth_failed_at" timestamp(3),
	"auth_failed_reason" text,
	"last_refreshed_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "integrationConnection_single_owner_check" CHECK (num_nonnulls("user_id", "workspace_id") = 1),
	CONSTRAINT "integrationConnection_token_envelope_check" CHECK (("access_token" IS NULL OR "access_token" LIKE 'enc:v1:%') AND ("refresh_token" IS NULL OR "refresh_token" LIKE 'enc:v1:%'))
);
--> statement-breakpoint
CREATE TABLE "integration_oauth_states" (
	"state" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"code_verifier" text NOT NULL,
	"return_path" text NOT NULL,
	"expires_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "connection_id" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "connection_id" text;--> statement-breakpoint
CREATE INDEX "emailAccount_connectionId_idx" ON "email_accounts" ("connection_id");--> statement-breakpoint
CREATE INDEX "integrationConnection_organizationId_idx" ON "integration_connections" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrationConnection_userId_provider_idx" ON "integration_connections" ("user_id","provider") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "integrationConnection_workspaceId_provider_externalAccountId_idx" ON "integration_connections" ("workspace_id","provider","external_account_id") WHERE "workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "integrationOauthState_userId_idx" ON "integration_oauth_states" ("user_id");--> statement-breakpoint
CREATE INDEX "integrationOauthState_expiresAt_idx" ON "integration_oauth_states" ("expires_at");--> statement-breakpoint
CREATE INDEX "socialPost_connectionId_idx" ON "social_posts" ("connection_id");--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_connection_id_integration_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_connection_id_integration_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL;