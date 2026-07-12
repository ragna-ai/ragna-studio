CREATE TABLE `agents` (
	`id` text PRIMARY KEY,
	`user_id` text,
	`ai_model_id` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_agents_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agents_ai_model_id_ai_models_id_fk` FOREIGN KEY (`ai_model_id`) REFERENCES `ai_models`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `agent_templates` (
	`id` text PRIMARY KEY,
	`ai_model_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_agent_templates_ai_model_id_ai_models_id_fk` FOREIGN KEY (`ai_model_id`) REFERENCES `ai_models`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `ai_models` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`modality` text NOT NULL,
	`family` text NOT NULL,
	`size` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text NOT NULL,
	`capabilities` text DEFAULT '{}',
	`meta` text DEFAULT '{}',
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_chats_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_chats_agent_id_agents_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_chat_messages_chat_id_chats_id_fk` FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `gen_images` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`prompt` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`aspect_ratio` text,
	`resolution` text,
	`seed` integer,
	`negative_prompt` text,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_gen_images_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token` text NOT NULL UNIQUE,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`impersonated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_session`(`id`, `user_id`, `token`, `expires_at`, `ip_address`, `user_agent`, `impersonated_by`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `token`, `expires_at`, `ip_address`, `user_agent`, `impersonated_by`, `created_at`, `updated_at` FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer NOT NULL,
	`image` text,
	`role` text,
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`(`id`, `name`, `email`, `email_verified`, `image`, `role`, `banned`, `ban_reason`, `ban_expires`, `created_at`, `updated_at`) SELECT `id`, `name`, `email`, `email_verified`, `image`, `role`, `banned`, `ban_reason`, `ban_expires`, `created_at`, `updated_at` FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `session_token_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `user_email_unique`;--> statement-breakpoint
CREATE INDEX `agent_userId_idx` ON `agents` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_aiModelId_idx` ON `agents` (`ai_model_id`);--> statement-breakpoint
CREATE INDEX `agent_template_aiModelId_idx` ON `agent_templates` (`ai_model_id`);--> statement-breakpoint
CREATE INDEX `chat_userId_idx` ON `chats` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_agentId_idx` ON `chats` (`agent_id`);--> statement-breakpoint
CREATE INDEX `chatMessage_chatId_idx` ON `chat_messages` (`chat_id`);--> statement-breakpoint
CREATE INDEX `genImage_userId_idx` ON `gen_images` (`user_id`);