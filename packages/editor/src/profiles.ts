import type { BlockType } from './commands';
import type { SlashCommandId } from './slash-command';

export type EditorProfileId = 'document' | 'email' | 'prompt';

interface EditorMenuOptions {
  /** What the `/` menu offers, in menu order. */
  slashCommands: readonly SlashCommandId[];
  /** The list, quote and code toggles the bubble menu offers, in order. */
  blockToggles: readonly BlockType[];
  /** Typing rewrites `--`, `...`, `(c)`, quotes and similar into typographic characters. */
  smartTypography: boolean;
  /** Typing or pasting `*x*`, `**x**`, `~~x~~` or backticks around text turns it into a mark. */
  markShortcuts: boolean;
}

export interface HtmlEditorProfile extends EditorMenuOptions {
  contentType: 'html';
}

export interface MarkdownEditorProfile extends EditorMenuOptions {
  contentType: 'markdown';
  /** 'verbatim' writes text nodes as typed: no HTML entities, no backslash escapes. */
  textEncoding: 'escaped' | 'verbatim';
}

export type EditorProfile = HtmlEditorProfile | MarkdownEditorProfile;

const ALL_SLASH_COMMANDS = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'table',
  'image',
] as const satisfies readonly SlashCommandId[];

const ALL_BLOCK_TOGGLES = [
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
] as const satisfies readonly BlockType[];

const PROMPT_EXCLUDED = new Set<string>(['image', 'taskList']);

function withoutPromptExcluded<T extends string>(items: readonly T[]): readonly T[] {
  return items.filter((item) => !PROMPT_EXCLUDED.has(item));
}

export const EDITOR_PROFILES = {
  document: {
    contentType: 'markdown',
    textEncoding: 'escaped',
    slashCommands: ALL_SLASH_COMMANDS,
    blockToggles: ALL_BLOCK_TOGGLES,
    smartTypography: true,
    markShortcuts: true,
  },
  email: {
    contentType: 'html',
    slashCommands: ALL_SLASH_COMMANDS,
    blockToggles: ALL_BLOCK_TOGGLES,
    smartTypography: true,
    markShortcuts: true,
  },
  prompt: {
    contentType: 'markdown',
    textEncoding: 'verbatim',
    slashCommands: withoutPromptExcluded(ALL_SLASH_COMMANDS),
    blockToggles: withoutPromptExcluded(ALL_BLOCK_TOGGLES),
    smartTypography: false,
    markShortcuts: false,
  },
} satisfies Record<EditorProfileId, EditorProfile>;

export function getEditorProfile(id: EditorProfileId): EditorProfile {
  return EDITOR_PROFILES[id];
}
