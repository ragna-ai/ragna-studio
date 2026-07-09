import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Chat, ChatMessage, ChatWithMessages } from '../schema';
import { chat, chatMessage } from '../schema';
import type { ICreateChat, ICreateChatMessage } from '../zod';

export async function createChat(values: ICreateChat): Promise<Chat> {
  const { userId, assistantId, title } = values;
  const [createdChat] = await db
    .insert(chat)
    .values({
      userId,
      assistantId,
      title,
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
    where: eq(chat.id, chatId),
    with: {
      messages: true,
    },
  });

  return chatRecord || null;
}

export async function getChatByIdForUser({ chatId, userId }: { chatId: string; userId: string }) {
  const chatRecord = await db.query.chat.findFirst({
    columns: {
      id: true,
      userId: true,
      assistantId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    where: and(eq(chat.id, chatId), eq(chat.userId, userId)),
    with: {
      assistant: {
        with: {
          aiModel: true,
        },
      },
      messages: {
        columns: {
          id: true,
          chatId: true,
          role: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: (c, { asc }) => asc(c.createdAt),
      },
    },
  });

  return chatRecord || null;
}

export async function getChatCountByUserId({ userId }: { userId: string }): Promise<number> {
  return db.$count(chat, eq(chat.userId, userId));
}

export async function getAllChatsByUserId({
  userId,
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}) {
  const chatRecords = await db.query.chat.findMany({
    columns: {
      id: true,
      userId: true,
      assistantId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      assistant: {
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
    where: eq(chat.userId, userId),
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

export async function deleteChatById({
  userId,
  chatId,
}: {
  userId: string;
  chatId: string;
}): Promise<void> {
  await db.delete(chat).where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

// CHAT MESSAGES
export async function getChatMessagesByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<ChatMessage[]> {
  const chatMessages = await db.query.chatMessage.findMany({
    where: eq(chatMessage.chatId, chatId),
    // orderBy: (cm) => [cm.createdAt.asc()],
  });

  return chatMessages;
}

export async function createChatMessage(values: ICreateChatMessage): Promise<ChatMessage> {
  const { chatId, role, content } = values;
  const [createdChatMessage] = await db
    .insert(chatMessage)
    .values({
      chatId,
      role,
      content,
    })
    .returning();

  if (!createdChatMessage) {
    throw new Error('Failed to create chat message');
  }

  return createdChatMessage;
}

export async function createChatMessages(messages: ICreateChatMessage[]): Promise<ChatMessage[]> {
  const createdChatMessages = await db.insert(chatMessage).values(messages).returning();

  if (!createdChatMessages || createdChatMessages.length === 0) {
    throw new Error('Failed to create chat messages');
  }

  return createdChatMessages;
}
