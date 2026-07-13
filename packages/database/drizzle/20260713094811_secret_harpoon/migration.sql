CREATE TABLE `workflows` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`definition` text DEFAULT '{"nodes":[],"edges":[]}' NOT NULL,
	`published_definition` text,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_workflows_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY,
	`workflow_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`definition` text NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_workflow_runs_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workflow_run_steps` (
	`id` text PRIMARY KEY,
	`run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_workflow_run_steps_run_id_workflow_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`id` text PRIMARY KEY,
	`user_id` text,
	`ai_model_id` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_agents_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agents_ai_model_id_ai_models_id_fk` FOREIGN KEY (`ai_model_id`) REFERENCES `ai_models`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_agents`(`id`, `user_id`, `ai_model_id`, `is_default`, `name`, `description`, `system_prompt`, `tools`, `settings`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `user_id`, `ai_model_id`, `is_default`, `name`, `description`, `system_prompt`, `tools`, `settings`, `created_at`, `updated_at`, `deleted_at` FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_templates` (
	`id` text PRIMARY KEY,
	`ai_model_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_agent_templates_ai_model_id_ai_models_id_fk` FOREIGN KEY (`ai_model_id`) REFERENCES `ai_models`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_agent_templates`(`id`, `ai_model_id`, `name`, `description`, `system_prompt`, `tools`, `settings`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `ai_model_id`, `name`, `description`, `system_prompt`, `tools`, `settings`, `created_at`, `updated_at`, `deleted_at` FROM `agent_templates`;--> statement-breakpoint
DROP TABLE `agent_templates`;--> statement-breakpoint
ALTER TABLE `__new_agent_templates` RENAME TO `agent_templates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_userId_idx` ON `agents` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_aiModelId_idx` ON `agents` (`ai_model_id`);--> statement-breakpoint
CREATE INDEX `agent_template_aiModelId_idx` ON `agent_templates` (`ai_model_id`);--> statement-breakpoint
CREATE INDEX `workflow_userId_idx` ON `workflows` (`user_id`);--> statement-breakpoint
CREATE INDEX `workflowRun_workflowId_idx` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `workflowRunStep_runId_idx` ON `workflow_run_steps` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflowRunStep_runId_nodeId_idx` ON `workflow_run_steps` (`run_id`,`node_id`);