export type NotificationGroupKey = 'today' | 'yesterday' | 'earlier';

export interface NotificationGroup<T> {
  key: NotificationGroupKey;
  items: T[];
}

const GROUP_ORDER: readonly NotificationGroupKey[] = [
  'today',
  'yesterday',
  'earlier',
];

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function groupKeyFor(
  createdAt: string,
  now: Date = new Date(),
): NotificationGroupKey {
  const dayStart = startOfDay(new Date(createdAt));
  const todayStart = startOfDay(now);
  if (dayStart >= todayStart) return 'today';
  const yesterdayStart = startOfDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
  return dayStart >= yesterdayStart ? 'yesterday' : 'earlier';
}

export function groupNotifications<T extends { createdAt: string }>(
  items: T[],
  now: Date = new Date(),
): NotificationGroup<T>[] {
  return GROUP_ORDER.map((key) => ({
    key,
    items: items.filter((item) => groupKeyFor(item.createdAt, now) === key),
  })).filter((group) => group.items.length > 0);
}
