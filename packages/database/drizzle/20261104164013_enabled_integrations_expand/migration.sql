ALTER TABLE "agents" ADD COLUMN "integration_tools" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "enabled_integrations" text[];