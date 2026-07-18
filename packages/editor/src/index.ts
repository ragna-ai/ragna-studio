export type { AnyExtension, JSONContent } from '@tiptap/core';
// Re-exported so `apps/web` (which has no direct @tiptap dependency) gets
// the Editor class and its EditorContent renderer through this package.
export { Editor, EditorContent } from '@tiptap/vue-3';

export * from './commands';
export * from './document-editor';
export * from './kit';
