// packages/mail/src/content/markdown-to-html.ts
//
// The outgoing edge of the pipeline described in html-to-markdown.ts:
// markdown stays canonical everywhere a human or an LLM touches a message
// body, but a Gmail draft is a MIME message and Gmail's own mobile/web UI
// renders whatever `text/html` part it finds, not markdown source. Without
// an HTML part, a draft opened or sent from Gmail directly (the whole point
// of pushing drafts into the real Gmail drafts folder, see
// docs/email/drafts-change-request.md) shows the recipient raw markdown,
// asterisks and all. This is the one place that renders markdown to HTML so
// every draft push can attach that HTML part alongside the markdown-derived
// `text` part.
//
// This only ever produces the *intermediate* draft body Gmail shows
// mid-edit. The final send still uses the client's Tiptap HTML, produced
// independently from the editor's own document model, not from this
// renderer's output. Do not unify the two: doing so would change what
// actually gets sent.
//
// Uses `marked` (already a workspace dependency, pinned at 18.0.9 in
// packages/export; kept at the same version here rather than introducing a
// second markdown library). Output targets email clients: no syntax
// highlighting, no heading ids, nothing that assumes a stylesheet is
// available. `marked`'s defaults already satisfy this — no extensions are
// registered.

import { marked } from 'marked';

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false });
}
