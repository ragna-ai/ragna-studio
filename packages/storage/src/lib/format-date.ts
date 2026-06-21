export function formatDate(
  date: Date | string | undefined,
  options: { locale?: string } = { locale: 'en-US' },
): string {
  if (!date) {
    return '-';
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(options.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
