CREATE TYPE "family" AS ENUM('llm', 'multimodal', 'vision', 'audio', 'video', 'diffusion');--> statement-breakpoint
CREATE TYPE "modality" AS ENUM('text', 'image', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "size" AS ENUM('small', 'medium', 'large', 'xlarge');--> statement-breakpoint
CREATE TYPE "role" AS ENUM('system', 'user', 'assistant');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_context_document_chunks" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "agent_context_documents" (
	"id" text PRIMARY KEY,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"extracted_text" text,
	"is_truncated" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY,
	"user_id" text,
	"workspace_id" text NOT NULL,
	"ai_model_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"context" text,
	"tools" jsonb DEFAULT '[]' NOT NULL,
	"default_dataset_id" text,
	"settings" jsonb NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"id" text PRIMARY KEY,
	"ai_model_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"tools" jsonb DEFAULT '[]' NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" text PRIMARY KEY,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"modality" "modality" NOT NULL,
	"family" "family" NOT NULL,
	"size" "size" NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"capabilities" jsonb DEFAULT '{}' NOT NULL,
	"meta" jsonb DEFAULT '{}' NOT NULL,
	"pricing" jsonb,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"title" text NOT NULL,
	"forked_from_chat_id" text,
	"forked_from_message_id" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY,
	"chat_id" text NOT NULL,
	"role" "role" NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '"{}"',
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL UNIQUE,
	"balance_micro_credits" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY,
	"credit_account_id" text NOT NULL,
	"amount_micro_credits" bigint NOT NULL,
	"kind" text NOT NULL,
	"usage_event_id" text,
	"idempotency_key" text NOT NULL UNIQUE,
	"balance_after_micro_credits" bigint NOT NULL,
	"description" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "credit_usage_events" (
	"id" text PRIMARY KEY,
	"credit_account_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"ai_model_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_display_name" text NOT NULL,
	"feature" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"reasoning_tokens" integer,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"billable_input_tokens" integer NOT NULL,
	"billable_output_tokens" integer NOT NULL,
	"unit_prices" jsonb NOT NULL,
	"markup_bps" integer NOT NULL,
	"cost_nano_usd" bigint NOT NULL,
	"actual_cost_nano_usd" bigint NOT NULL,
	"charged_micro_credits" bigint NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"origin" text DEFAULT 'user' NOT NULL,
	"columns" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "dataset_rows" (
	"id" text PRIMARY KEY,
	"dataset_id" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"sort_order" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"folder_id" text,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"created_by_agent_id" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL UNIQUE,
	"provider" text DEFAULT 'gmail' NOT NULL,
	"email" text NOT NULL,
	"sync_cursor" text,
	"default_agent_id" text,
	"sync_state" text DEFAULT 'idle' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "email_auto_draft_senders" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"sender_email" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "email_categories" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"auto_draft" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "email_drafts" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"origin" text NOT NULL,
	"kind" text NOT NULL,
	"thread_id" text,
	"reply_to_message_id" text,
	"agent_id" text,
	"to" jsonb DEFAULT '[]' NOT NULL,
	"cc" jsonb DEFAULT '[]' NOT NULL,
	"bcc" jsonb DEFAULT '[]' NOT NULL,
	"subject" text,
	"content" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"quoted_html" text,
	"quoted_text" text,
	"attachments" jsonb DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"provider_draft_id" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"from" jsonb NOT NULL,
	"to" jsonb DEFAULT '[]' NOT NULL,
	"cc" jsonb DEFAULT '[]',
	"subject" text,
	"snippet" text,
	"sent_at" timestamp NOT NULL,
	"is_unread" boolean DEFAULT true NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"label_ids" jsonb DEFAULT '[]' NOT NULL,
	"category_id" text,
	"needs_reply" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "email_message_bodies" (
	"message_id" text PRIMARY KEY,
	"text_body" text,
	"html_body" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_thread_id" text NOT NULL,
	"subject" text,
	"snippet" text,
	"last_message_at" timestamp,
	"participants" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "gen_images" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"media_id" text,
	"error" text,
	"prompt" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"aspect_ratio" text,
	"resolution" text,
	"seed" integer,
	"negative_prompt" text,
	"visible_watermark" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "gen_image_reference" (
	"id" text PRIMARY KEY,
	"gen_image_id" text NOT NULL,
	"media_id" text NOT NULL,
	"origin" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "gen_videos" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"media_id" text,
	"error" text,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"aspect_ratio" text,
	"resolution" text,
	"duration" integer,
	"generate_audio" boolean DEFAULT true NOT NULL,
	"seed" integer,
	"visible_watermark" boolean DEFAULT false NOT NULL,
	"frame_origin" text,
	"frame_media_id" text,
	"is_draft" boolean DEFAULT false NOT NULL,
	"draft_cache_key" text,
	"parent_gen_video_id" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "chat_attachments" (
	"id" text PRIMARY KEY,
	"chat_id" text NOT NULL,
	"media_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY,
	"owner_user_id" text,
	"owner_workspace_id" text,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"origin" text NOT NULL,
	"extracted_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_exactly_one_owner_check" CHECK (num_nonnulls("owner_user_id", "owner_workspace_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" text PRIMARY KEY,
	"agent_id" text NOT NULL UNIQUE,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" text DEFAULT 'linkedin' NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'agent' NOT NULL,
	"external_id" text,
	"external_url" text,
	"published_at" timestamp,
	"publish_error" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "social_post_media" (
	"id" text PRIMARY KEY,
	"social_post_id" text NOT NULL,
	"media_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"origin" text NOT NULL,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"sort_order" text NOT NULL,
	"due_date" timestamp,
	"remind_days_before_due" integer,
	"reminder_sent_at" timestamp,
	"parent_task_id" text,
	"assigned_agent_id" text,
	"created_by_user_id" text,
	"created_by_agent_id" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" text PRIMARY KEY,
	"task_id" text NOT NULL,
	"media_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "tasks_to_task_labels" (
	"task_id" text,
	"task_label_id" text,
	CONSTRAINT "tasks_to_task_labels_pkey" PRIMARY KEY("task_id","task_label_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"definition" jsonb DEFAULT '{"nodes":[],"edges":[]}' NOT NULL,
	"published_definition" jsonb,
	"schedule_cron" text,
	"schedule_timezone" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"triggered_by" text DEFAULT 'manual' NOT NULL,
	"definition" jsonb NOT NULL,
	"input" text,
	"output" text,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "workflow_run_steps" (
	"id" text PRIMARY KEY,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" text,
	"output" text,
	"trace" jsonb,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_providerId_accountId_idx" ON "account" ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "agentContextDocumentChunk_agentId_idx" ON "agent_context_document_chunks" ("agent_id");--> statement-breakpoint
CREATE INDEX "agentContextDocument_agentId_idx" ON "agent_context_documents" ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_userId_idx" ON "agents" ("user_id");--> statement-breakpoint
CREATE INDEX "agent_aiModelId_idx" ON "agents" ("ai_model_id");--> statement-breakpoint
CREATE INDEX "agent_workspaceId_idx" ON "agents" ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_defaultDatasetId_idx" ON "agents" ("default_dataset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_default_per_workspace_idx" ON "agents" ("user_id","workspace_id") WHERE "is_default" AND "workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_default_unassigned_idx" ON "agents" ("user_id") WHERE "is_default" AND "workspace_id" IS NULL;--> statement-breakpoint
CREATE INDEX "agent_template_aiModelId_idx" ON "agent_templates" ("ai_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_provider_model_idx" ON "ai_models" ("provider","model");--> statement-breakpoint
CREATE INDEX "chat_userId_idx" ON "chats" ("user_id");--> statement-breakpoint
CREATE INDEX "chat_agentId_idx" ON "chats" ("agent_id");--> statement-breakpoint
CREATE INDEX "chat_workspaceId_idx" ON "chats" ("workspace_id");--> statement-breakpoint
CREATE INDEX "chat_title_trgm_idx" ON "chats" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "chatMessage_chatId_idx" ON "chat_messages" ("chat_id");--> statement-breakpoint
CREATE INDEX "creditLedger_creditAccountId_createdAt_idx" ON "credit_ledger" ("credit_account_id","created_at");--> statement-breakpoint
CREATE INDEX "creditUsageEvent_creditAccountId_idx" ON "credit_usage_events" ("credit_account_id");--> statement-breakpoint
CREATE INDEX "creditUsageEvent_workspaceId_idx" ON "credit_usage_events" ("workspace_id");--> statement-breakpoint
CREATE INDEX "dataset_userId_idx" ON "datasets" ("user_id");--> statement-breakpoint
CREATE INDEX "dataset_workspaceId_idx" ON "datasets" ("workspace_id");--> statement-breakpoint
CREATE INDEX "datasetRow_datasetId_idx" ON "dataset_rows" ("dataset_id");--> statement-breakpoint
CREATE INDEX "document_workspaceId_idx" ON "documents" ("workspace_id");--> statement-breakpoint
CREATE INDEX "emailAccount_defaultAgentId_idx" ON "email_accounts" ("default_agent_id");--> statement-breakpoint
CREATE INDEX "emailAutoDraftSender_accountId_idx" ON "email_auto_draft_senders" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emailAutoDraftSender_accountId_senderEmail_idx" ON "email_auto_draft_senders" ("account_id","sender_email");--> statement-breakpoint
CREATE INDEX "emailCategory_accountId_idx" ON "email_categories" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emailCategory_accountId_name_idx" ON "email_categories" ("account_id","name");--> statement-breakpoint
CREATE INDEX "emailDraft_accountId_idx" ON "email_drafts" ("account_id");--> statement-breakpoint
CREATE INDEX "emailDraft_threadId_idx" ON "email_drafts" ("thread_id");--> statement-breakpoint
CREATE INDEX "emailDraft_replyToMessageId_idx" ON "email_drafts" ("reply_to_message_id");--> statement-breakpoint
CREATE INDEX "emailDraft_agentId_idx" ON "email_drafts" ("agent_id");--> statement-breakpoint
CREATE INDEX "emailDraft_providerDraftId_idx" ON "email_drafts" ("provider_draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emailDraft_accountId_providerDraftId_idx" ON "email_drafts" ("account_id","provider_draft_id");--> statement-breakpoint
CREATE INDEX "emailMessage_accountId_idx" ON "email_messages" ("account_id");--> statement-breakpoint
CREATE INDEX "emailMessage_threadId_idx" ON "email_messages" ("thread_id");--> statement-breakpoint
CREATE INDEX "emailMessage_categoryId_idx" ON "email_messages" ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emailMessage_accountId_providerMessageId_idx" ON "email_messages" ("account_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "emailThread_accountId_idx" ON "email_threads" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emailThread_accountId_providerThreadId_idx" ON "email_threads" ("account_id","provider_thread_id");--> statement-breakpoint
CREATE INDEX "folder_workspaceId_idx" ON "folders" ("workspace_id");--> statement-breakpoint
CREATE INDEX "genImage_userId_idx" ON "gen_images" ("user_id");--> statement-breakpoint
CREATE INDEX "genImage_workspaceId_idx" ON "gen_images" ("workspace_id");--> statement-breakpoint
CREATE INDEX "genImage_mediaId_idx" ON "gen_images" ("media_id");--> statement-breakpoint
CREATE INDEX "genImageReference_genImageId_idx" ON "gen_image_reference" ("gen_image_id");--> statement-breakpoint
CREATE INDEX "genImageReference_mediaId_idx" ON "gen_image_reference" ("media_id");--> statement-breakpoint
CREATE INDEX "genVideo_userId_idx" ON "gen_videos" ("user_id");--> statement-breakpoint
CREATE INDEX "genVideo_workspaceId_idx" ON "gen_videos" ("workspace_id");--> statement-breakpoint
CREATE INDEX "genVideo_mediaId_idx" ON "gen_videos" ("media_id");--> statement-breakpoint
CREATE INDEX "genVideo_frameMediaId_idx" ON "gen_videos" ("frame_media_id");--> statement-breakpoint
CREATE INDEX "genVideo_parentGenVideoId_idx" ON "gen_videos" ("parent_gen_video_id");--> statement-breakpoint
CREATE INDEX "chatAttachment_chatId_idx" ON "chat_attachments" ("chat_id");--> statement-breakpoint
CREATE INDEX "chatAttachment_mediaId_idx" ON "chat_attachments" ("media_id");--> statement-breakpoint
CREATE INDEX "media_ownerWorkspaceId_idx" ON "media" ("owner_workspace_id");--> statement-breakpoint
CREATE INDEX "notifications_userId_idx" ON "notifications" ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications" ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "socialPost_userId_idx" ON "social_posts" ("user_id");--> statement-breakpoint
CREATE INDEX "socialPost_workspaceId_idx" ON "social_posts" ("workspace_id");--> statement-breakpoint
CREATE INDEX "socialPostMedia_socialPostId_idx" ON "social_post_media" ("social_post_id");--> statement-breakpoint
CREATE INDEX "socialPostMedia_mediaId_idx" ON "social_post_media" ("media_id");--> statement-breakpoint
CREATE INDEX "task_workspaceId_idx" ON "tasks" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_workspaceId_number_idx" ON "tasks" ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "taskAttachment_taskId_idx" ON "task_attachments" ("task_id");--> statement-breakpoint
CREATE INDEX "taskAttachment_mediaId_idx" ON "task_attachments" ("media_id");--> statement-breakpoint
CREATE INDEX "taskLabel_workspaceId_idx" ON "task_labels" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taskLabel_workspaceId_name_idx" ON "task_labels" ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "user_banned_idx" ON "users" ("banned");--> statement-breakpoint
CREATE INDEX "user_emailVerified_idx" ON "users" ("email_verified");--> statement-breakpoint
CREATE INDEX "user_createdAt_idx" ON "users" ("created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "workflow_userId_idx" ON "workflows" ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_workspaceId_idx" ON "workflows" ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflowRun_workflowId_idx" ON "workflow_runs" ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflowRunStep_runId_idx" ON "workflow_run_steps" ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflowRunStep_runId_nodeId_idx" ON "workflow_run_steps" ("run_id","node_id");--> statement-breakpoint
CREATE INDEX "workspace_ownerId_idx" ON "workspaces" ("owner_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_context_document_chunks" ADD CONSTRAINT "agent_context_document_chunks_m1BUIXoTaEy3_fkey" FOREIGN KEY ("document_id") REFERENCES "agent_context_documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_context_document_chunks" ADD CONSTRAINT "agent_context_document_chunks_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_context_documents" ADD CONSTRAINT "agent_context_documents_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_ai_model_id_ai_models_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_default_dataset_id_datasets_id_fkey" FOREIGN KEY ("default_dataset_id") REFERENCES "datasets"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_ai_model_id_ai_models_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_forked_from_chat_id_chats_id_fkey" FOREIGN KEY ("forked_from_chat_id") REFERENCES "chats"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_forked_from_message_id_chat_messages_id_fkey" FOREIGN KEY ("forked_from_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_credit_account_id_credit_accounts_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "credit_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_usage_event_id_credit_usage_events_id_fkey" FOREIGN KEY ("usage_event_id") REFERENCES "credit_usage_events"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_usage_events" ADD CONSTRAINT "credit_usage_events_credit_account_id_credit_accounts_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "credit_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_usage_events" ADD CONSTRAINT "credit_usage_events_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_usage_events" ADD CONSTRAINT "credit_usage_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_usage_events" ADD CONSTRAINT "credit_usage_events_ai_model_id_ai_models_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dataset_rows" ADD CONSTRAINT "dataset_rows_dataset_id_datasets_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_agent_id_agents_id_fkey" FOREIGN KEY ("created_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_default_agent_id_agents_id_fkey" FOREIGN KEY ("default_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "email_auto_draft_senders" ADD CONSTRAINT "email_auto_draft_senders_account_id_email_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_categories" ADD CONSTRAINT "email_categories_account_id_email_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_account_id_email_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_thread_id_email_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_reply_to_message_id_email_messages_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id");--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_account_id_email_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_category_id_email_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "email_categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "email_message_bodies" ADD CONSTRAINT "email_message_bodies_message_id_email_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_account_id_email_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gen_images" ADD CONSTRAINT "gen_images_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gen_images" ADD CONSTRAINT "gen_images_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gen_images" ADD CONSTRAINT "gen_images_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id");--> statement-breakpoint
ALTER TABLE "gen_image_reference" ADD CONSTRAINT "gen_image_reference_gen_image_id_gen_images_id_fkey" FOREIGN KEY ("gen_image_id") REFERENCES "gen_images"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gen_image_reference" ADD CONSTRAINT "gen_image_reference_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id");--> statement-breakpoint
ALTER TABLE "gen_videos" ADD CONSTRAINT "gen_videos_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gen_videos" ADD CONSTRAINT "gen_videos_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gen_videos" ADD CONSTRAINT "gen_videos_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id");--> statement-breakpoint
ALTER TABLE "gen_videos" ADD CONSTRAINT "gen_videos_frame_media_id_media_id_fkey" FOREIGN KEY ("frame_media_id") REFERENCES "media"("id");--> statement-breakpoint
ALTER TABLE "gen_videos" ADD CONSTRAINT "gen_videos_parent_gen_video_id_gen_videos_id_fkey" FOREIGN KEY ("parent_gen_video_id") REFERENCES "gen_videos"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_workspace_id_workspaces_id_fkey" FOREIGN KEY ("owner_workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_post_media" ADD CONSTRAINT "social_post_media_social_post_id_social_posts_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_post_media" ADD CONSTRAINT "social_post_media_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_agent_id_agents_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_agent_id_agents_id_fkey" FOREIGN KEY ("created_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id");--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks_to_task_labels" ADD CONSTRAINT "tasks_to_task_labels_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks_to_task_labels" ADD CONSTRAINT "tasks_to_task_labels_task_label_id_task_labels_id_fkey" FOREIGN KEY ("task_label_id") REFERENCES "task_labels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;