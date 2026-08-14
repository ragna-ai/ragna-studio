// packages/mail/src/types/joplin-turndown-plugin-gfm.d.ts
//
// @joplin/turndown-plugin-gfm ships no type declarations and there's no
// @types package for it either. Minimal shim for the plugin surface
// actually used in content/html-to-markdown.ts.

declare module '@joplin/turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  type TurndownPlugin = (service: TurndownService) => void;

  export const gfm: TurndownPlugin;
  export const tables: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
}
