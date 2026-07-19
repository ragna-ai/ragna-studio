import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Chat, ChatMessage } from '../schema';
import { chat, chatMessage } from '../schema';
import type { ICreateChat, ICreateChatMessage, IUpsertChatMessage } from '../zod';

export type { Chat, ChatMessage } from '../schema';

export async function createChat(payload: ICreateChat): Promise<Chat> {
  const [createdChat] = await db
    .insert(chat)
    .values({
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      agentId: payload.agentId,
      title: payload.title,
    })
    .returning();

  if (!createdChat) {
    throw new Error('Failed to create chat');
  }

  return createdChat;
}

// Kept for the WS layer (chat.service.ts's runChatStream, channel.service.ts's
// subscribe authorizer): those check ownership via the authenticated userId,
// not the HTTP workspace guard. Do not repurpose for the REST controller.
export async function getChatByIdForUser(payload: { chatId: string; userId: string }) {
  const chatRecord = await db.query.chat.findFirst({
    columns: {
      id: true,
      userId: true,
      workspaceId: true,
      agentId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { id: payload.chatId, userId: payload.userId },
    with: {
      agent: {
        with: {
          aiModel: true,
        },
      },
      messages: {
        columns: {
          id: true,
          role: true,
          parts: true,
          metadata: true,
          createdAt: true,
        },
        // A turn's user and assistant message are upserted in one insert and
        // share createdAt; the time-ordered uuidv7 id breaks the tie.
        orderBy: (c, { asc }) => [asc(c.createdAt), asc(c.id)],
      },
    },
  });

  return chatRecord || null;
}

// Same shape as getChatByIdForUser, scoped by workspaceId instead of userId:
// the REST controller's `GET /:chatId`, called after the workspace guard has
// already verified ownership of workspaceId.
export async function getChatByIdForWorkspace(payload: { chatId: string; workspaceId: string }) {
  const chatRecord = await db.query.chat.findFirst({
    columns: {
      id: true,
      agentId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { id: payload.chatId, workspaceId: payload.workspaceId },
    with: {
      messages: {
        columns: {
          id: true,
          role: true,
          parts: true,
          metadata: true,
          createdAt: true,
        },
        // A turn's user and assistant message are upserted in one insert and
        // share createdAt; the time-ordered uuidv7 id breaks the tie.
        orderBy: (c, { asc }) => [asc(c.createdAt), asc(c.id)],
      },
    },
  });

  return chatRecord || null;
}

export async function getChatCountByWorkspaceId(payload: { workspaceId: string }): Promise<number> {
  return db.$count(chat, eq(chat.workspaceId, payload.workspaceId));
}

export async function getChatsByWorkspaceId({
  workspaceId,
  limit,
  sort = 'desc',
  offset,
}: {
  workspaceId: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}) {
  const chatRecords = await db.query.chat.findMany({
    columns: {
      id: true,
      agentId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      agent: {
        columns: {
          id: true,
          name: true,
        },
        with: {
          aiModel: {
            columns: { id: true, provider: true, displayName: true },
          },
        },
      },
    },
    where: { workspaceId },
    limit,
    offset,
    // Pagination contract (docs/api-standards/prd.md): sort by createdAt.
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
  });

  return chatRecords || [];
}

// Kept for the WS layer (chat.service.ts's runChatStream persists a
// generated title mid-stream, scoped by userId there). The REST controller's
// `PATCH /:chatId` uses updateChatTitleByWorkspaceId below instead.
export async function updateChatTitleById({
  chatId,
  userId,
  title,
}: {
  chatId: string;
  userId: string;
  title: string;
}): Promise<Chat | null> {
  const [updatedChat] = await db
    .update(chat)
    .set({ title })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning();

  return updatedChat ?? null;
}

export async function updateChatTitleByWorkspaceId({
  chatId,
  workspaceId,
  title,
}: {
  chatId: string;
  workspaceId: string;
  title: string;
}): Promise<Chat | null> {
  const [updatedChat] = await db
    .update(chat)
    .set({ title })
    .where(and(eq(chat.id, chatId), eq(chat.workspaceId, workspaceId)))
    .returning();

  return updatedChat ?? null;
}

export async function deleteChatByWorkspaceId({
  chatId,
  workspaceId,
}: {
  chatId: string;
  workspaceId: string;
}) {
  return db.delete(chat).where(and(eq(chat.id, chatId), eq(chat.workspaceId, workspaceId)));
}

// CHAT MESSAGES
export async function getChatMessagesByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<ChatMessage[]> {
  const chatMessages = await db.query.chatMessage.findMany({
    where: { chatId },
    // orderBy: (cm) => [cm.createdAt.asc()],
  });

  return chatMessages;
}

export async function createChatMessage(payload: ICreateChatMessage): Promise<ChatMessage> {
  const { chatId, role, parts, metadata } = payload;
  const [createdChatMessage] = await db
    .insert(chatMessage)
    .values({
      chatId,
      role,
      parts,
      metadata,
    })
    .returning();

  if (!createdChatMessage) {
    throw new Error('Failed to create chat message');
  }

  return createdChatMessage;
}

export async function createChatMessages(payload: ICreateChatMessage[]): Promise<ChatMessage[]> {
  const createdChatMessages = await db.insert(chatMessage).values(payload).returning();

  if (!createdChatMessages || createdChatMessages.length === 0) {
    throw new Error('Failed to create chat messages');
  }

  return createdChatMessages;
}

export async function upsertChatMessages(payload: IUpsertChatMessage[]): Promise<ChatMessage[]> {
  const upsertedChatMessages = await db
    .insert(chatMessage)
    .values(payload)
    .onConflictDoUpdate({
      target: chatMessage.id,
      set: {
        parts: sql`excluded.parts`,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();

  if (!upsertedChatMessages || upsertedChatMessages.length === 0) {
    throw new Error('Failed to upsert chat messages');
  }

  return upsertedChatMessages;
}
