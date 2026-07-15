import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Chat, ChatMessage, ChatWithMessages } from '../schema';
import { chat, chatMessage } from '../schema';
import type { ICreateChat, ICreateChatMessage, IUpsertChatMessage } from '../zod';

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

export async function getChatById({
  chatId,
}: {
  chatId: string;
}): Promise<ChatWithMessages | null> {
  const chatRecord = await db.query.chat.findFirst({
    where: { id: chatId },
    with: {
      messages: true,
    },
  });

  return chatRecord || null;
}

export async function getChatByIdForUser(payload: { chatId: string; userId: string }) {
  const chatRecord = await db.query.chat.findFirst({
    columns: {
      id: true,
      userId: true,
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
        orderBy: (c, { asc }) => asc(c.createdAt),
      },
    },
  });

  return chatRecord || null;
}

export async function getChatCountByUserId(payload: {
  userId: string;
  workspaceId?: string;
}): Promise<number> {
  return db.$count(
    chat,
    and(
      eq(chat.userId, payload.userId),
      payload.workspaceId ? eq(chat.workspaceId, payload.workspaceId) : undefined,
    ),
  );
}

export async function getAllChatsByUserId({
  userId,
  workspaceId,
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
  workspaceId?: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}) {
  const chatRecords = await db.query.chat.findMany({
    columns: {
      id: true,
      userId: true,
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
    where: { userId, workspaceId },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.updatedAt) : desc(t.updatedAt)),
  });

  return chatRecords || [];
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}): Promise<Chat> {
  const [updatedChat] = await db.update(chat).set({ title }).where(eq(chat.id, chatId)).returning();

  if (!updatedChat) {
    throw new Error('Failed to update chat title');
  }

  return updatedChat;
}

export async function deleteChatById({ userId, chatId }: { userId: string; chatId: string }) {
  return db.delete(chat).where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
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
