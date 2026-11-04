UPDATE "email_accounts" SET "integration_id" = CASE "provider" WHEN 'microsoft' THEN 'outlook-mail' ELSE "provider" END WHERE "integration_id" IS NULL;
