import type { SlashCommandId } from '@repo/editor';
import { ImageIcon, MinusIcon, TableIcon } from '@lucide/vue';
import type { Component } from 'vue';
import { BLOCK_TYPE_ICONS } from './block-type-icons';

export interface SlashItem {
  id: SlashCommandId;
  labelKey: string;
  icon: Component;
  aliases: readonly string[];
  markdownShortcut?: string;
}

export type SlashTranslate = (key: string) => string;

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    id: 'paragraph',
    labelKey: 'editor.blockType.paragraph',
    icon: BLOCK_TYPE_ICONS.paragraph,
    aliases: ['text', 'paragraph', 'p'],
  },
  {
    id: 'h1',
    labelKey: 'editor.blockType.h1',
    icon: BLOCK_TYPE_ICONS.h1,
    aliases: ['h1', 'heading1', 'title'],
    markdownShortcut: '# ',
  },
  {
    id: 'h2',
    labelKey: 'editor.blockType.h2',
    icon: BLOCK_TYPE_ICONS.h2,
    aliases: ['h2', 'heading2', 'subtitle'],
    markdownShortcut: '## ',
  },
  {
    id: 'h3',
    labelKey: 'editor.blockType.h3',
    icon: BLOCK_TYPE_ICONS.h3,
    aliases: ['h3', 'heading3'],
    markdownShortcut: '### ',
  },
  {
    id: 'h4',
    labelKey: 'editor.blockType.h4',
    icon: BLOCK_TYPE_ICONS.h4,
    aliases: ['h4', 'heading4'],
    markdownShortcut: '#### ',
  },
  {
    id: 'bulletList',
    labelKey: 'editor.blockType.bulletList',
    icon: BLOCK_TYPE_ICONS.bulletList,
    aliases: ['ul', 'bullet', 'list'],
    markdownShortcut: '- ',
  },
  {
    id: 'orderedList',
    labelKey: 'editor.blockType.orderedList',
    icon: BLOCK_TYPE_ICONS.orderedList,
    aliases: ['ol', 'number', 'ordered'],
    markdownShortcut: '1. ',
  },
  {
    id: 'taskList',
    labelKey: 'editor.blockType.taskList',
    icon: BLOCK_TYPE_ICONS.taskList,
    aliases: ['todo', 'task', 'checkbox', 'checklist'],
    markdownShortcut: '[ ] ',
  },
  {
    id: 'blockquote',
    labelKey: 'editor.blockType.blockquote',
    icon: BLOCK_TYPE_ICONS.blockquote,
    aliases: ['quote', 'blockquote'],
    markdownShortcut: '> ',
  },
  {
    id: 'codeBlock',
    labelKey: 'editor.blockType.codeBlock',
    icon: BLOCK_TYPE_ICONS.codeBlock,
    aliases: ['code', 'codeblock', 'pre'],
    markdownShortcut: '```',
  },
  {
    id: 'horizontalRule',
    labelKey: 'editor.slash.horizontalRule',
    icon: MinusIcon,
    aliases: ['hr', 'divider', 'rule', 'line'],
    markdownShortcut: '---',
  },
  {
    id: 'table',
    labelKey: 'editor.slash.table',
    icon: TableIcon,
    aliases: ['table', 'grid'],
  },
  {
    id: 'image',
    labelKey: 'editor.slash.image',
    icon: ImageIcon,
    aliases: ['img', 'image', 'picture', 'photo'],
  },
];

function startsAnyWord(label: string, query: string): boolean {
  return label.split(/\s+/).some((word) => word.startsWith(query));
}

/** Keeps items whose translated label starts a word with the query, or whose alias starts with it. */
export function filterSlashItems(
  items: readonly SlashItem[],
  query: string,
  translate: SlashTranslate,
): readonly SlashItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((item) => {
    const label = translate(item.labelKey).toLowerCase();
    const matchesAlias = item.aliases.some((alias) =>
      alias.startsWith(normalizedQuery),
    );
    return matchesAlias || startsAnyWord(label, normalizedQuery);
  });
}
