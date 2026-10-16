ALTER TABLE "mcp_tool_calls" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD COLUMN "access" text;--> statement-breakpoint
-- Backfill from the owning connection. Only write calls were recorded before.
UPDATE "mcp_tool_calls" AS "call"
SET "user_id" = "connection"."user_id",
  "client_id" = "connection"."client_id",
  "workspace_id" = "connection"."workspace_id",
  "access" = 'write'
FROM "mcp_connections" AS "connection"
WHERE "call"."connection_id" = "connection"."id";--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ALTER COLUMN "access" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "mcpToolCall_userId_idx" ON "mcp_tool_calls" ("user_id");--> statement-breakpoint
CREATE INDEX "mcpToolCall_createdAt_idx" ON "mcp_tool_calls" ("created_at");--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" DROP CONSTRAINT "mcp_tool_calls_connection_id_mcp_connections_id_fkey", ADD CONSTRAINT "mcp_tool_calls_connection_id_mcp_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "mcp_connections"("id") ON DELETE SET NULL;