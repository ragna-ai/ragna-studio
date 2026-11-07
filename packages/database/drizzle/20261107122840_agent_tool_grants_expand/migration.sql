ALTER TABLE "agents" ADD COLUMN "tool_grants" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD COLUMN "tool_grants" jsonb DEFAULT '[]' NOT NULL;