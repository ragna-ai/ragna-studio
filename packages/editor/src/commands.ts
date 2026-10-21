import type { ChainedCommands, Editor as CoreEditor } from '@tiptap/core';
import type { Editor } from '@tiptap/vue-3';

export type TextFormat = 'bold' | 'italic' | 'strike' | 'code';

export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock';

/**
 * Formatting/block commands, kept behind plain typed functions for the same
 * reason as `getEditorContent()`: each one chains a command that an extension
 * adds to `ChainedCommands` via `declare module '@tiptap/core'`
 * (e.g. `toggleBold` from the bold extension). tsdown's dts rollup doesn't
 * carry those augmentations to this package's consumers, and apps/web has no
 * @tiptap dependency of its own to pull them in, so the augmented `.chain()`
 * calls have to live here, where kit.ts's extension imports keep the
 * augmentations in scope.
 */
export function formatText(editor: Editor, format: TextFormat): boolean {
  const chain = editor.chain().focus();
  switch (format) {
    case 'bold':
      return chain.toggleBold().run();
    case 'italic':
      return chain.toggleItalic().run();
    case 'strike':
      return chain.toggleStrike().run();
    case 'code':
      return chain.toggleCode().run();
  }
}

const HEADING_LEVELS = { h1: 1, h2: 2, h3: 3, h4: 4 } as const;

function isHeadingType(type: BlockType): type is keyof typeof HEADING_LEVELS {
  return type in HEADING_LEVELS;
}

/**
 * Appends the commands that turn the selected blocks into `type`. Shared by
 * `setBlockType` and the slash command so both are one undo step.
 */
export function applyBlockType(
  editor: CoreEditor,
  chain: ChainedCommands,
  type: BlockType,
): ChainedCommands {
  if (getActiveBlockType(editor) === type) return chain;
  const plainBlocks = chain.clearNodes();
  if (isHeadingType(type)) return plainBlocks.setHeading({ level: HEADING_LEVELS[type] });
  switch (type) {
    case 'paragraph':
      return plainBlocks;
    case 'bulletList':
      return plainBlocks.toggleBulletList();
    case 'orderedList':
      return plainBlocks.toggleOrderedList();
    case 'taskList':
      return plainBlocks.toggleTaskList();
    case 'blockquote':
      return plainBlocks.toggleBlockquote();
    case 'codeBlock':
      return plainBlocks.setCodeBlock();
  }
}

/** Sets the selected blocks to `type`. Picking the current type does nothing. */
export function setBlockType(editor: Editor, type: BlockType): boolean {
  if (getActiveBlockType(editor) === type) return false;
  return applyBlockType(editor, editor.chain().focus(), type).run();
}

function getBlockTypeAt(editor: CoreEditor, pos: number): BlockType {
  const $pos = editor.state.doc.resolve(pos);
  const textblock = $pos.parent;
  if (textblock.type.name === 'codeBlock') return 'codeBlock';
  if (textblock.type.name === 'heading') {
    const level = textblock.attrs.level;
    if (level === 1) return 'h1';
    if (level === 2) return 'h2';
    if (level === 3) return 'h3';
    if (level === 4) return 'h4';
  }
  for (let depth = $pos.depth - 1; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (
      name === 'taskList' ||
      name === 'bulletList' ||
      name === 'orderedList' ||
      name === 'blockquote'
    ) {
      return name;
    }
  }
  return 'paragraph';
}

/** The block type of the selection, or 'mixed' when it spans different types. */
export function getActiveBlockType(editor: CoreEditor): BlockType | 'mixed' {
  const { from, to } = editor.state.selection;
  const types = new Set<BlockType>();
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) types.add(getBlockTypeAt(editor, pos + 1));
    return !node.isTextblock;
  });
  if (types.size > 1) return 'mixed';
  return types.values().next().value ?? 'paragraph';
}

export function setHorizontalRule(editor: Editor): boolean {
  return editor.chain().focus().setHorizontalRule().run();
}

/** Moves the caret to the end of the document and focuses the editor. */
export function focusEnd(editor: Editor): boolean {
  return editor.chain().focus('end').run();
}

/** Whether the caret is inside a table, for toggling table-editing UI. */
export function isInsideTable(editor: Editor): boolean {
  return editor.can().deleteTable();
}

export function insertTable(editor: Editor): boolean {
  return editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

export function addRowBefore(editor: Editor): boolean {
  return editor.chain().focus().addRowBefore().run();
}

export function addRowAfter(editor: Editor): boolean {
  return editor.chain().focus().addRowAfter().run();
}

export function deleteRow(editor: Editor): boolean {
  return editor.chain().focus().deleteRow().run();
}

export function addColumnBefore(editor: Editor): boolean {
  return editor.chain().focus().addColumnBefore().run();
}

export function addColumnAfter(editor: Editor): boolean {
  return editor.chain().focus().addColumnAfter().run();
}

export function deleteColumn(editor: Editor): boolean {
  return editor.chain().focus().deleteColumn().run();
}

export function deleteTable(editor: Editor): boolean {
  return editor.chain().focus().deleteTable().run();
}

/** Current link URL at the caret, or an empty string when not on a link. */
export function getLinkUrl(editor: Editor): string {
  return editor.getAttributes('link').href ?? '';
}

export function setLink(editor: Editor, url: string): boolean {
  return editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

export function unsetLink(editor: Editor): boolean {
  return editor.chain().focus().extendMarkRange('link').unsetLink().run();
}

export function insertImage(editor: Editor, url: string): boolean {
  return editor.chain().focus().setImage({ src: url }).run();
}
