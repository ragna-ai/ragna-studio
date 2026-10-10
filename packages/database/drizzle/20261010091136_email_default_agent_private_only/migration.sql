DO $$
DECLARE
  cleared_accounts integer;
BEGIN
  UPDATE "email_accounts" ea
    SET "default_agent_id" = NULL
    WHERE ea."default_agent_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "agents" a
        JOIN "workspaces" w ON w."id" = a."workspace_id"
        WHERE a."id" = ea."default_agent_id"
          AND w."personal_user_id" = ea."user_id"
      );
  GET DIAGNOSTICS cleared_accounts = ROW_COUNT;

  RAISE NOTICE 'email_default_agent_private_only: % accounts', cleared_accounts;
END $$;
