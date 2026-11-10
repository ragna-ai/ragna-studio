import type { ViewOption } from '~/components/ViewSwitcher.vue';

export type MarkdownFieldView = 'formatted' | 'raw';

export const MARKDOWN_FIELD_VIEWS: readonly ViewOption<MarkdownFieldView>[] = [
  { value: 'formatted', labelKey: 'editor.field.markdown' },
  { value: 'raw', labelKey: 'editor.field.raw' },
];

/** The view choice is remembered across fields, pages and reloads. */
export function useMarkdownFieldView() {
  return useLocalStorage<MarkdownFieldView>('markdown-field:view', 'formatted');
}
