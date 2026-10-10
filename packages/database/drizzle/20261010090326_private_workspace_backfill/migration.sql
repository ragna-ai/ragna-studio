DO $$
DECLARE
  backfilled_workspaces integer;
BEGIN
  INSERT INTO "workspaces" ("id", "organization_id", "name", "visibility", "personal_user_id", "created_at", "updated_at")
    SELECT uuidv7()::text, m."organization_id", 'Private', 'personal', m."user_id", now(), now()
    FROM "members" m
    WHERE NOT EXISTS (
      SELECT 1 FROM "workspaces" w WHERE w."personal_user_id" = m."user_id"
    );
  GET DIAGNOSTICS backfilled_workspaces = ROW_COUNT;

  RAISE NOTICE 'private_workspace_backfill: % workspaces', backfilled_workspaces;
END $$;
