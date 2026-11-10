import type { SlashCommandId } from '@repo/editor';

export const FORMAT_MENU_ICONS: Record<SlashCommandId, `hugeicons:${string}`> =
  {
    paragraph: 'hugeicons:text',
    h1: 'hugeicons:heading-01',
    h2: 'hugeicons:heading-02',
    h3: 'hugeicons:heading-03',
    h4: 'hugeicons:heading-04',
    bulletList: 'hugeicons:left-to-right-list-bullet',
    orderedList: 'hugeicons:left-to-right-list-number',
    taskList: 'hugeicons:task-done-01',
    blockquote: 'hugeicons:quote-down',
    codeBlock: 'hugeicons:source-code',
    horizontalRule: 'hugeicons:minus-sign',
    table: 'hugeicons:table',
    image: 'hugeicons:image-01',
  };
