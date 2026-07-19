import { index, jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { agent, type Agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export const chat = pgTable(
  'chats',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    ...timestamps,
  },
  (table) => [
    index('chat_userId_idx').on(table.userId),
    index('chat_agentId_idx').on(table.agentId),
    index('chat_workspaceId_idx').on(table.workspaceId),
  ],
);

export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;

export const chatMessageRoles = ['system', 'user', 'assistant'] as const;
export type ChatMessageRole = (typeof chatMessageRoles)[number];

export const pgRoleEnum = pgEnum('role', chatMessageRoles);

// CHAT MESSAGE
export const chatMessage = pgTable(
  'chat_messages',
  {
    id: primaryIdColumn,
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    role: pgRoleEnum().notNull(),
    // UIMessage parts stored 1:1 (text, reasoning, tool calls, files, ...)
    parts: jsonb('parts').notNull().$type<unknown[]>(),
    metadata: jsonb('metadata').default('{}').$type<Record<string, any>>(),
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

export type ChatWithAgent = Chat & {
  agent: Agent;
};

export type ChatWithMessagesAgent = Chat & {
  agent: Agent;
  messages: ChatMessage[];
};
