import { parseExpression } from 'cron-parser';

const CRON_FIELD_COUNT = 5;

// Only 5-field (minute granularity) expressions are supported. cron-parser
// itself also accepts a 6-field (seconds) form, so the field count is
// checked explicitly before handing off to the parser.
export function isValidCronExpression(cron: string): boolean {
  if (cron.trim().split(/\s+/).length !== CRON_FIELD_COUNT) {
    return false;
  }

  try {
    parseExpression(cron);
    return true;
  } catch {
    return false;
  }
}

export function getNextCronOccurrences(cron: string, timezone: string, count: number): Date[] {
  const interval = parseExpression(cron, { tz: timezone });

  return Array.from({ length: count }, () => interval.next().toDate());
}
