export function safeParseInt(value: string): number | null {
  const result = Number.parseInt(value, 10);
  return Number.isNaN(result) ? null : result;
}
