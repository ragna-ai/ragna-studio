// European date formatting (specs/datasets/export-and-row-reorder.md decision
// 2, "Date formatting"): hardcoded for now, no locale plumbing yet.

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Renders a stored `date` column value (ISO `yyyy-mm-dd`, per
 * specs/datasets.md decision 1) as `dd.mm.yyyy`. A value that doesn't match
 * the stored format passes through unchanged rather than throwing.
 */
export function toEuropeanDate(value: string): string {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Renders a timestamp as `dd.mm.yyyy HH:mm`, used for the dataset PDF's
 * export-date line (filenames stay ISO `yyyy-mm-dd` so they keep sorting
 * correctly).
 */
export function toEuropeanDateTime(date: Date): string {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}
