DELETE FROM "account" AS newer
USING "account" AS older
WHERE newer."user_id" = older."user_id"
  AND newer."provider_id" = older."provider_id"
  AND (newer."created_at" > older."created_at" OR (newer."created_at" = older."created_at" AND newer."id" > older."id"));
