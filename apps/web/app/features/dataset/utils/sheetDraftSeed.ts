import type { DatasetColumnType } from '~/features/dataset/types';

/** The editor draft for text typed before the editor opened, or `undefined` if the column can't use it. */
export function seedDraftFor(
  columnType: DatasetColumnType,
  typedText: string,
): string | undefined {
  if (columnType === 'text') {
    return typedText || undefined;
  }
  if (columnType === 'number') {
    return typedText.replace(/[^\d.-]/g, '') || undefined;
  }
  return undefined;
}
