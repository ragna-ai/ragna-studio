const REMOVAL_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO date when a soft-deleted member or organization is purged for good. */
export function finalDeletionDate(deletedAt: string): string {
  return new Date(
    new Date(deletedAt).getTime() + REMOVAL_WINDOW_DAYS * MS_PER_DAY,
  ).toISOString();
}
