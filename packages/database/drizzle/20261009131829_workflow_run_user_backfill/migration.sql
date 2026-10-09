DO $$
DECLARE
  backfilled_runs integer;
BEGIN
  UPDATE "workflow_runs" r SET "triggered_by_user_id" = w."user_id"
    FROM "workflows" w
    WHERE w."id" = r."workflow_id" AND r."triggered_by_user_id" IS NULL;
  GET DIAGNOSTICS backfilled_runs = ROW_COUNT;

  RAISE NOTICE 'workflow_run_user_backfill: % runs', backfilled_runs;
END $$;
