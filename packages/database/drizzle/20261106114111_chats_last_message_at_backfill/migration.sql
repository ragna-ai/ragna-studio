UPDATE "chats"
SET "last_message_at" = coalesce(
  (SELECT max("created_at") FROM "chat_messages" WHERE "chat_messages"."chat_id" = "chats"."id"),
  "chats"."created_at"
);
