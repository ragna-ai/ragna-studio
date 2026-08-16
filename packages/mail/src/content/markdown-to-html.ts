// packages/mail/src/content/markdown-to-html.ts
//
// The AI draft agent still writes its reply as markdown (DRAFT_TASK_INSTRUCTIONS
// in apps/worker's email-draft.service.ts), the one place markdown remains an
// authored format rather than just an LLM-reading one. A Gmail draft is a MIME
// message, and Gmail's own mobile/web UI renders whatever `text/html` part it
// finds, not markdown source, so the agent's output is rendered here before
// being pushed. For a genuinely plain-text quote fallback (no markdown
// involved), use `textToHtml` instead - see its doc comment for why.
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
