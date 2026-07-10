import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/create-id';
import { assistant, type Assistant } from './assistant.schema';
import { timestamps } from './common.schema';
import { user } from './user.schema';

export const chat = sqliteTable(
  'chats',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    assistantId: text('assistant_id')
      .notNull()
      .references(() => assistant.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    ...timestamps,
  },
  (table) => [
    index('chat_userId_idx').on(table.userId),
    index('chat_assistantId_idx').on(table.assistantId),
  ],
);

export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;

// CHAT MESSAGE
export const chatMessage = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['system', 'user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    // embedding: vector('embedding', { dimensions: 1024 }),
    ...timestamps,
  },
  (table) => [index('chatMessage_chatId_idx').on(table.chatId)],
);

export type ChatMessage = typeof chatMessage.$inferSelect;
export type NewChatMessage = typeof chatMessage.$inferInsert;

export type ChatWithMessages = Chat & {
  messages: ChatMessage[];
};

export type ChatWithAssistant = Chat & {
  assistant: Assistant;
};

export type ChatWithMessagesAssistant = Chat & {
  assistant: Assistant;
  messages: ChatMessage[];
};
