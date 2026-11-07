-- Overwrites tool_grants from the old columns: nothing wrote tool_grants before this release.
UPDATE "agents" AS a
SET "tool_grants" =
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', first_use."id") ORDER BY first_use."position")
    FROM (
      SELECT t."id", MIN(t."position") AS "position"
      FROM jsonb_array_elements_text(a."tools") WITH ORDINALITY AS t("id", "position")
      WHERE t."id" IN ('think', 'webSearch', 'webBrowser', 'imageGen', 'videoGen', 'linkedinDraft', 'memory', 'datasets', 'documents', 'tasks')
      GROUP BY t."id"
    ) AS first_use
  ), '[]'::jsonb)
  || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', i."key", 'access', i."value") ORDER BY i."key")
    FROM jsonb_each_text(a."integration_tools") AS i
    WHERE i."key" IN ('google-drive') AND i."value" IN ('read', 'write')
  ), '[]'::jsonb);--> statement-breakpoint
-- Overwrites tool_grants from the old column (templates only hold built-in tools).
UPDATE "agent_templates" AS t
SET "tool_grants" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('id', first_use."id") ORDER BY first_use."position")
  FROM (
    SELECT e."id", MIN(e."position") AS "position"
    FROM jsonb_array_elements_text(t."tools") WITH ORDINALITY AS e("id", "position")
    WHERE e."id" IN ('think', 'webSearch', 'webBrowser', 'imageGen', 'videoGen', 'linkedinDraft', 'memory', 'datasets', 'documents', 'tasks')
    GROUP BY e."id"
  ) AS first_use
), '[]'::jsonb);
