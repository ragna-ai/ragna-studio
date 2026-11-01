import type { DatasetColumn } from '~/features/dataset/types';

export type ParsedCellValue =
  | { kind: 'empty' }
  | { kind: 'valid'; value: string | number }
  | { kind: 'mismatch'; raw: string };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Classifies a stored value against the column's current type. Stored values
 * are never converted, so any value can fail to fit. Mirrors the API's
 * `validateValueForColumn`, except dates must also be ISO `yyyy-mm-dd`.
 */
export function parseCellValue(
  column: DatasetColumn,
  raw: unknown,
): ParsedCellValue {
  if (raw === null || raw === undefined || raw === '') {
    return { kind: 'empty' };
  }

  const mismatch: ParsedCellValue = { kind: 'mismatch', raw: String(raw) };

  if (column.type === 'number') {
    return typeof raw === 'number' ? { kind: 'valid', value: raw } : mismatch;
  }

  if (typeof raw !== 'string') {
    return mismatch;
  }

  if (column.type === 'select') {
    return column.options?.includes(raw)
      ? { kind: 'valid', value: raw }
      : mismatch;
  }

  if (column.type === 'date') {
    return ISO_DATE_PATTERN.test(raw)
      ? { kind: 'valid', value: raw }
      : mismatch;
  }

  return { kind: 'valid', value: raw };
}
