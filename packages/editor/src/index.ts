export type { AnyExtension, JSONContent } from '@tiptap/core';
// Re-exported so `apps/web` (which has no direct @tiptap dependency) gets
// the Editor class, its EditorContent renderer and the BubbleMenu through this package.
export { Editor, EditorContent } from '@tiptap/vue-3';
export { BubbleMenu } from '@tiptap/vue-3/menus';

export * from './commands';
export * from './kit';
export * from './rich-text-editor';
export * from './slash-command';
