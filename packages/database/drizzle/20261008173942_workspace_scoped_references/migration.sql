ALTER TABLE "tasks_to_task_labels" ADD COLUMN "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_unique" UNIQUE("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_workspace_id_unique" UNIQUE("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_unique" UNIQUE("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_unique" UNIQUE("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_workspace_id_unique" UNIQUE("workspace_id","id");
--> statement-breakpoint
DO $$
DECLARE
  backfilled integer;
  deleted_labels integer;
  cleared_agents integer;
  cleared_folders integer;
  cleared_datasets integer;
BEGIN
  UPDATE "tasks_to_task_labels" j SET "workspace_id" = t."workspace_id"
    FROM "tasks" t WHERE t."id" = j."task_id";
  GET DIAGNOSTICS backfilled = ROW_COUNT;

  DELETE FROM "tasks_to_task_labels" j USING "task_labels" l
    WHERE l."id" = j."task_label_id" AND l."workspace_id" <> j."workspace_id";
  GET DIAGNOSTICS deleted_labels = ROW_COUNT;

  UPDATE "tasks" t SET "assigned_agent_id" = NULL
    FROM "agents" a WHERE a."id" = t."assigned_agent_id" AND a."workspace_id" <> t."workspace_id";
  GET DIAGNOSTICS cleared_agents = ROW_COUNT;

  UPDATE "documents" d SET "folder_id" = NULL
    FROM "folders" f WHERE f."id" = d."folder_id" AND f."workspace_id" <> d."workspace_id";
  GET DIAGNOSTICS cleared_folders = ROW_COUNT;

  UPDATE "agents" a SET "default_dataset_id" = NULL
    FROM "datasets" ds WHERE ds."id" = a."default_dataset_id" AND ds."workspace_id" <> a."workspace_id";
  GET DIAGNOSTICS cleared_datasets = ROW_COUNT;

  RAISE NOTICE 'workspace-scoped references: backfilled % task label rows, deleted % cross-workspace task labels, cleared % task agents, % document folders, % agent datasets',
    backfilled, deleted_labels, cleared_agents, cleared_folders, cleared_datasets;
END $$;
--> statement-breakpoint
ALTER TABLE "tasks_to_task_labels" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_default_dataset_id_datasets_id_fkey";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_folder_id_folders_id_fkey";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigned_agent_id_agents_id_fkey";
--> statement-breakpoint
ALTER TABLE "tasks_to_task_labels" DROP CONSTRAINT "tasks_to_task_labels_task_id_tasks_id_fkey";
--> statement-breakpoint
ALTER TABLE "tasks_to_task_labels" DROP CONSTRAINT "tasks_to_task_labels_task_label_id_task_labels_id_fkey";
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_default_dataset_workspace_fk" FOREIGN KEY ("workspace_id","default_dataset_id") REFERENCES "datasets"("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_workspace_fk" FOREIGN KEY ("workspace_id","folder_id") REFERENCES "folders"("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_agent_workspace_fk" FOREIGN KEY ("workspace_id","assigned_agent_id") REFERENCES "agents"("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "tasks_to_task_labels" ADD CONSTRAINT "tasks_to_task_labels_task_workspace_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "tasks"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "tasks_to_task_labels" ADD CONSTRAINT "tasks_to_task_labels_label_workspace_fk" FOREIGN KEY ("workspace_id","task_label_id") REFERENCES "task_labels"("workspace_id","id") ON DELETE CASCADE;
