DO $$
DECLARE
  created_organizations integer;
  created_members integer;
  linked_workspaces integer;
  linked_credit_accounts integer;
  linked_sessions integer;
BEGIN
  CREATE TEMP TABLE "user_organization_backfill" ON COMMIT DROP AS
    SELECT u."id" AS "user_id", u."name" AS "user_name", uuidv7()::text AS "organization_id"
    FROM "users" u
    WHERE NOT EXISTS (SELECT 1 FROM "members" m WHERE m."user_id" = u."id");

  INSERT INTO "organizations" ("id", "name", "slug", "created_at")
    SELECT "organization_id", "user_name", "organization_id", now()
    FROM "user_organization_backfill";
  GET DIAGNOSTICS created_organizations = ROW_COUNT;

  INSERT INTO "members" ("id", "organization_id", "user_id", "role", "created_at")
    SELECT uuidv7()::text, "organization_id", "user_id", 'owner', now()
    FROM "user_organization_backfill";
  GET DIAGNOSTICS created_members = ROW_COUNT;

  UPDATE "workspaces" w SET "organization_id" = m."organization_id"
    FROM "members" m
    WHERE m."user_id" = w."owner_id" AND w."organization_id" IS NULL;
  GET DIAGNOSTICS linked_workspaces = ROW_COUNT;

  UPDATE "credit_accounts" c SET "organization_id" = m."organization_id"
    FROM "members" m
    WHERE m."user_id" = c."user_id" AND c."organization_id" IS NULL;
  GET DIAGNOSTICS linked_credit_accounts = ROW_COUNT;

  UPDATE "sessions" s SET "active_organization_id" = m."organization_id"
    FROM "members" m
    WHERE m."user_id" = s."user_id" AND s."active_organization_id" IS NULL;
  GET DIAGNOSTICS linked_sessions = ROW_COUNT;

  RAISE NOTICE 'organizations backfill: created % organizations and % owner members, linked % workspaces, % credit accounts, % sessions',
    created_organizations, created_members, linked_workspaces, linked_credit_accounts, linked_sessions;
END $$;
