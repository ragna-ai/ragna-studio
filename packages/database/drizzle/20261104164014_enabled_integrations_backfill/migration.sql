WITH normalized AS (
  SELECT
    "id",
    "provider",
    ARRAY(
      SELECT lower(regexp_replace(s, '^.*/', '')) FROM unnest("scopes") AS s
    ) AS "short_scopes"
  FROM "integration_connections"
)
UPDATE "integration_connections" AS c
SET "enabled_integrations" = ARRAY(
  SELECT i FROM (
    SELECT 'gmail' AS i
      WHERE n."provider" = 'google' AND 'gmail.modify' = ANY(n."short_scopes")
    UNION ALL
    SELECT 'outlook-mail'
      WHERE n."provider" = 'microsoft'
        AND 'mail.readwrite' = ANY(n."short_scopes")
        AND 'mail.send' = ANY(n."short_scopes")
    UNION ALL
    SELECT 'linkedin-posting'
      WHERE n."provider" = 'linkedin' AND 'w_member_social' = ANY(n."short_scopes")
  ) AS covered
)
FROM normalized AS n
WHERE n."id" = c."id" AND c."enabled_integrations" IS NULL;
