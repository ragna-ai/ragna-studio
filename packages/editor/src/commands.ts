import type { Editor } from '@tiptap/vue-3';

export type TextFormat = 'h1' | 'h2' | 'bold' | 'italic' | 'underline' | 'strike' | 'highlight';

/**
 * Formatting/list/focus commands, kept behind plain typed functions for the
 * same reason as `getDocumentMarkdown()`: each one chains a command that an
 * extension adds to `ChainedCommands` via `declare module '@tiptap/core'`
 * (e.g. `toggleHeading` from the heading extension, `setTextAlign` from
 * text-align). tsdown's dts rollup doesn't carry those augmentations to this
 * package's consumers, and apps/web has no @tiptap dependency of its own to
 * pull them in, so the augmented `.chain()` calls have to live here, where
 * kit.ts's extension imports keep the augmentations in scope.
 */
export function formatText(editor: Editor, format: TextFormat): boolean {
  const chain = editor.chain().focus();
  switch (format) {
    case 'h1':
      return chain.toggleHeading({ level: 1 }).run();
    case 'h2':
      return chain.toggleHeading({ level: 2 }).run();
    case 'bold':
      return chain.toggleBold().run();
    case 'italic':
      return chain.toggleItalic().run();
    case 'underline':
      return chain.toggleUnderline().run();
    case 'strike':
      return chain.toggleStrike().run();
    case 'highlight':
      return chain.toggleHighlight().run();
  }
}

export function cycleList(editor: Editor): boolean {
  const chain = editor.chain().focus();
  if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
    return chain.toggleOrderedList().run();
  }
  return chain.toggleBulletList().run();
}

export function cycleTextOrientation(editor: Editor): boolean {
  const chain = editor.chain().focus();
  if (editor.isActive({ textAlign: 'left' })) {
    return chain.setTextAlign('center').run();
  }
  if (editor.isActive({ textAlign: 'center' })) {
    return chain.setTextAlign('right').run();
  }
  if (editor.isActive({ textAlign: 'right' })) {
    return chain.setTextAlign('justify').run();
  }
  if (editor.isActive({ textAlign: 'justify' })) {
    return chain.setTextAlign('left').run();
  }
  return chain.setTextAlign('center').run();
}

export function toggleTaskList(editor: Editor): boolean {
  return editor.chain().focus().toggleTaskList().run();
}

export function undo(editor: Editor): boolean {
  return editor.chain().focus().undo().run();
}

export function redo(editor: Editor): boolean {
  return editor.chain().focus().redo().run();
}

/** Moves the caret to the end of the document and focuses the editor. */
export function focusEnd(editor: Editor): boolean {
  return editor.chain().focus('end').run();
}
