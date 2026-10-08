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
      // Sidebar provenance badge ("forked from {title}").
      forkedFromChat: {
        columns: { title: true },
      },
    },
    where: { workspaceId },
    limit,
    offset,
    // Pagination contract: sort by createdAt.
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

// CHAT SEARCH
//
// pg_trgm substring search across a workspace's chats: a chat matches by
// title (backed by chat_title_trgm_idx) or by having at least one message
// whose text content matches. No tsvector, no LLM: plain LIKE/ILIKE
// containment, case sensitivity toggled by the caller.

function toSearchPattern(query: string): string {
  return `%${query}%`;
}

// LIKE/ILIKE is a SQL keyword, not a bindable value, so it's injected as
// raw SQL text via sql.raw rather than a parameter. Safe here: the only
// inputs are the two literal keywords below, never caller-supplied text.
function matchOperator(caseSensitive: boolean) {
  return sql.raw(caseSensitive ? 'LIKE' : 'ILIKE');
}

/**
 * Shared CTE (`ranked_chat_matches`) behind both `getChatSearchMatchCount`
 * and `getChatSearchMatches`: one chat_id per matching chat, with the most
 * recent match timestamp (`matched_at`, either a matching message's
 * `created_at` or the chat's own `updated_at` for title-only matches) and
 * whether the title itself matched. Scoped to `workspaceId` throughout, so
 * the message-content half only ever unpacks one workspace's `parts` jsonb,
 * not the whole table (chat_workspaceId_idx backs that join).
 */
function chatSearchRankedMatchesCte(workspaceId: string, pattern: string, caseSensitive: boolean) {
  const operator = matchOperator(caseSensitive);

  return sql`
    WITH title_matches AS (
      SELECT ${chat.id} AS chat_id, ${chat.updatedAt} AS matched_at, true AS title_matched
      FROM ${chat}
      WHERE ${chat.workspaceId} = ${workspaceId} AND ${chat.title} ${operator} ${pattern}
    ), message_matches AS (
      SELECT ${chatMessage.chatId} AS chat_id, MAX(${chatMessage.createdAt}) AS matched_at, false AS title_matched
      FROM ${chatMessage}
      INNER JOIN ${chat} ON ${chat.id} = ${chatMessage.chatId}
      WHERE ${chat.workspaceId} = ${workspaceId}
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(${chatMessage.parts}) AS part
          WHERE part ->> 'type' = 'text' AND part ->> 'text' ${operator} ${pattern}
        )
      GROUP BY ${chatMessage.chatId}
    ), combined_matches AS (
      SELECT chat_id, matched_at, title_matched FROM title_matches
      UNION ALL
      SELECT chat_id, matched_at, title_matched FROM message_matches
    ), ranked_chat_matches AS (
      SELECT chat_id, MAX(matched_at) AS matched_at, BOOL_OR(title_matched) AS title_matched
      FROM combined_matches
      GROUP BY chat_id
    )
  `;
}

export async function getChatSearchMatchCount({
  workspaceId,
  query,
  caseSensitive,
}: {
  workspaceId: string;
  query: string;
  caseSensitive: boolean;
}): Promise<number> {
  const pattern = toSearchPattern(query);

  const result = await db.execute<{ count: string }>(sql`
    ${chatSearchRankedMatchesCte(workspaceId, pattern, caseSensitive)}
    SELECT COUNT(*) AS count FROM ranked_chat_matches
  `);

  return Number(result.rows[0]?.count ?? 0);
}

interface ChatSearchMatch {
  chatId: string;
  matchedAt: Date;
  titleMatched: boolean;
}

async function getChatSearchMatches({
  workspaceId,
  query,
  limit,
  offset,
  caseSensitive,
}: {
  workspaceId: string;
  query: string;
  limit: number;
  offset: number;
  caseSensitive: boolean;
}): Promise<ChatSearchMatch[]> {
  const pattern = toSearchPattern(query);

  const result = await db.execute<{
    chat_id: string;
    matched_at: Date;
    title_matched: boolean;
  }>(sql`
    ${chatSearchRankedMatchesCte(workspaceId, pattern, caseSensitive)}
    SELECT chat_id, matched_at, title_matched
    FROM ranked_chat_matches
    ORDER BY matched_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return result.rows.map((row) => ({
    chatId: row.chat_id,
    matchedAt: row.matched_at,
    titleMatched: row.title_matched,
  }));
}

export interface ChatSearchMatchedChat {
  id: string;
  title: string;
  updatedAt: Date;
  titleMatched: boolean;
  matchedAt: Date;
  agent: {
    id: string;
    name: string;
    aiModel: { id: string; provider: string; displayName: string };
  };
}

/**
 * Paginated, distinct list of a workspace's chats matching `query` by title
 * or message content, most-recently-matching first. Pairs with
 * `getChatSearchMatchCount` for the response's `totalCount`, mirroring the
 * count/list split `listChatsForWorkspace` already uses.
 */
export async function getChatSearchMatchedChats({
  workspaceId,
  query,
  limit,
  offset,
  caseSensitive,
}: {
  workspaceId: string;
  query: string;
  limit: number;
  offset: number;
  caseSensitive: boolean;
}): Promise<ChatSearchMatchedChat[]> {
  const matches = await getChatSearchMatches({ workspaceId, query, limit, offset, caseSensitive });
  if (matches.length === 0) {
    return [];
  }

  const chatIds = matches.map((match) => match.chatId);
  const chatRecords = await db.query.chat.findMany({
    columns: { id: true, title: true, updatedAt: true },
    where: { id: { in: chatIds } },
    with: {
      agent: {
        columns: { id: true, name: true },
        with: {
          aiModel: { columns: { id: true, provider: true, displayName: true } },
        },
      },
    },
  });
  const chatById = new Map(chatRecords.map((chatRecord) => [chatRecord.id, chatRecord]));

  // `id IN (...)` doesn't preserve order, so re-apply the match ranking
  // (most recent match first) computed by getChatSearchMatches.
  return matches
    .map((match) => {
      const chatRecord = chatById.get(match.chatId);
      if (!chatRecord) {
        return null;
      }

      return {
        id: chatRecord.id,
        title: chatRecord.title,
        updatedAt: chatRecord.updatedAt,
        titleMatched: match.titleMatched,
        matchedAt: match.matchedAt,
        agent: {
          id: chatRecord.agent.id,
          name: chatRecord.agent.name,
          aiModel: {
            id: chatRecord.agent.aiModel.id,
            provider: chatRecord.agent.aiModel.provider,
            displayName: chatRecord.agent.aiModel.displayName,
          },
        },
      };
    })
    .filter((matchedChat): matchedChat is ChatSearchMatchedChat => matchedChat !== null);
}

// Characters of context kept on each side of the match when building a
// Google-style snippet.
const SEARCH_SNIPPET_CONTEXT_CHARS = 60;

/**
 * Slices a fixed-size window of `text` around the first occurrence of
 * `query` (case-insensitive unless `caseSensitive`, matching how the row
 * was found in SQL), marking the match with `<mark>` tags for the frontend
 * to render as highlighting. No `ts_headline`: that's a tsvector-only
 * feature, not available for this trgm approach.
 */
function buildHighlightedSnippet(text: string, query: string, caseSensitive: boolean): string {
  const matchIndex = caseSensitive
    ? text.indexOf(query)
    : text.toLowerCase().indexOf(query.toLowerCase());
  if (matchIndex === -1) {
    // Defensive fallback only: every row reaching this function was already
    // matched by the same LIKE/ILIKE pattern in SQL.
    return text.slice(0, SEARCH_SNIPPET_CONTEXT_CHARS * 2);
  }

  const matchEnd = matchIndex + query.length;
  const windowStart = Math.max(0, matchIndex - SEARCH_SNIPPET_CONTEXT_CHARS);
  const windowEnd = Math.min(text.length, matchEnd + SEARCH_SNIPPET_CONTEXT_CHARS);

  const leadingEllipsis = windowStart > 0 ? '…' : '';
  const trailingEllipsis = windowEnd < text.length ? '…' : '';

  return (
    leadingEllipsis +
    text.slice(windowStart, matchIndex) +
    `<mark>${text.slice(matchIndex, matchEnd)}</mark>` +
    text.slice(matchEnd, windowEnd) +
    trailingEllipsis
  );
}

export interface ChatSearchMessageSnippet {
  messageId: string;
  snippet: string;
}

/**
 * Up to `limit` messages in `chatId` whose text content matches `query`,
 * most recent first, each collapsed to one highlighted snippet (a message
 * with several matching text parts only contributes its first match).
 */
export async function getChatSearchMessageSnippets({
  chatId,
  query,
  limit,
  caseSensitive,
}: {
  chatId: string;
  query: string;
  limit: number;
  caseSensitive: boolean;
}): Promise<ChatSearchMessageSnippet[]> {
  const pattern = toSearchPattern(query);
  const operator = matchOperator(caseSensitive);

  const result = await db.execute<{
    message_id: string;
    text: string;
  }>(sql`
    SELECT message_id, text FROM (
      SELECT DISTINCT ON (${chatMessage.id})
        ${chatMessage.id} AS message_id,
        part ->> 'text' AS text,
        ${chatMessage.createdAt} AS created_at
      FROM ${chatMessage}
      CROSS JOIN LATERAL jsonb_array_elements(${chatMessage.parts}) AS part
      WHERE ${chatMessage.chatId} = ${chatId}
        AND part ->> 'type' = 'text'
        AND part ->> 'text' ${operator} ${pattern}
      ORDER BY ${chatMessage.id}
    ) AS matched_messages
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row) => ({
    messageId: row.message_id,
    snippet: buildHighlightedSnippet(row.text, query, caseSensitive),
  }));
}

// BRANCHING
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
      .where(
        and(
          eq(chatAttachment.chatId, chatId),
          lte(chatAttachment.createdAt, cutoffMessage.createdAt),
        ),
      );
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
