import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Chat, ChatMessage } from '../schema';
import { chat, chatAttachment, chatMessage } from '../schema';
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
        // Rows within a turn can share createdAt (second precision); the
        // time-ordered uuidv7 id breaks the tie.
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
      messages: {
        columns: {
          id: true,
          role: true,
          parts: true,
          metadata: true,
          createdAt: true,
        },
        // Rows within a turn can share createdAt (second precision); the
        // time-ordered uuidv7 id breaks the tie.
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
      forkedFromChatId: true,
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
      // Sidebar provenance badge ("forked from {title}"), docs/chat/branching.md.
      forkedFromChat: {
        columns: { title: true },
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

// BRANCHING (docs/chat/branching.md)
//
// Copy-on-branch, not a shared message tree: the new chat gets its own rows
// (new ids/timestamps) for every message up to and including the cutoff, so
// it is fully independent of the source chat from the moment it's created.
export async function branchChatByWorkspaceId({
  chatId,
  workspaceId,
  messageId,
}: {
  chatId: string;
  workspaceId: string;
  messageId: string;
}): Promise<Chat | null> {
  return db.transaction(async (tx) => {
    const sourceChat = await tx.query.chat.findFirst({ where: { id: chatId, workspaceId } });
    if (!sourceChat) {
      return null;
    }

    // Rows within a turn can share createdAt (second precision); the
    // time-ordered uuidv7 id breaks the tie, same as the read paths above.
    const allMessages = await tx.query.chatMessage.findMany({
      where: { chatId },
      orderBy: (m, { asc }) => [asc(m.createdAt), asc(m.id)],
    });
    const cutoffIndex = allMessages.findIndex((m) => m.id === messageId);
    if (cutoffIndex === -1) {
      return null;
    }
    const messagesToCopy = allMessages.slice(0, cutoffIndex + 1);
    const cutoffMessage = allMessages[cutoffIndex];
    if (!cutoffMessage) {
      return null;
    }

    const [branchedChat] = await tx
      .insert(chat)
      .values({
        userId: sourceChat.userId,
        workspaceId: sourceChat.workspaceId,
        agentId: sourceChat.agentId,
        title: `${sourceChat.title} (branch)`,
        forkedFromChatId: sourceChat.id,
        forkedFromMessageId: messageId,
      })
      .returning();

    if (!branchedChat) {
      throw new Error('Failed to create branched chat');
    }

    await tx.insert(chatMessage).values(
      messagesToCopy.map((m) => ({
        chatId: branchedChat.id,
        role: m.role,
        parts: m.parts,
        metadata: m.metadata,
      })),
    );

    // Attachments aren't linked to a specific message (chat_attachments is
    // keyed by chatId only), so there's no exact per-message filter. Files
    // are uploaded before the message that references them is sent, so
    // "uploaded at or before the cutoff message" reliably captures every
    // attachment the copied messages can reference, without parsing the
    // UIMessage parts JSON to look for file references.
    const attachmentsToCopy = await tx
      .select()
      .from(chatAttachment)
      .where(and(eq(chatAttachment.chatId, chatId), lte(chatAttachment.createdAt, cutoffMessage.createdAt)));
    if (attachmentsToCopy.length > 0) {
      await tx.insert(chatAttachment).values(
        attachmentsToCopy.map((a) => ({
          chatId: branchedChat.id,
          mediaId: a.mediaId,
        })),
      );
    }

    return branchedChat;
  });
}
