/**
 * Chat route for a given chat, opened at its default (latest) position
 * (specs/chat/search-prd.md, "Click behavior (v1)"). `messageId` is accepted
 * but unused for now, so a later scroll-to-and-highlight-message feature
 * (each search snippet already carries its `messageId`) is a frontend-only
 * addition, not a change to this call site.
 */
export function chatUrl(chatId: string, _messageId?: string): string {
  return `/chat/${chatId}`;
}
