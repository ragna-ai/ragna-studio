export type ChatHistoryGroupKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'earlier';

export interface ChatHistoryGroup<T> {
  key: ChatHistoryGroupKey;
  chats: T[];
}

const GROUP_ORDER: ChatHistoryGroupKey[] = [
  'today',
  'yesterday',
  'thisWeek',
  'earlier',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function groupKeyFor(lastMessageAt: string, now: Date): ChatHistoryGroupKey {
  const day = startOfDay(new Date(lastMessageAt));
  const today = startOfDay(now);
  if (day >= today) return 'today';
  if (day >= today - DAY_MS) return 'yesterday';
  if (day >= today - 6 * DAY_MS) return 'thisWeek';
  return 'earlier';
}

/** Groups chats (newest first) by local day; empty groups are left out. */
export function groupChatsByRecency<T extends { lastMessageAt: string }>(
  chats: T[],
  now: Date = new Date(),
): ChatHistoryGroup<T>[] {
  const byKey = new Map<ChatHistoryGroupKey, T[]>();
  for (const chat of chats) {
    const key = groupKeyFor(chat.lastMessageAt, now);
    byKey.set(key, [...(byKey.get(key) ?? []), chat]);
  }
  return GROUP_ORDER.flatMap((key) => {
    const group = byKey.get(key);
    return group ? [{ key, chats: group }] : [];
  });
}
