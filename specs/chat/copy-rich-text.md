# Copy message text as rich text (proposal)

> **Status: proposed, not implemented.** Follow-up to the "Copy text"
> action added in `specs/chat/branching.md` (`ChatMessage.vue`'s message
> dropdown menu).

## Problem

"Copy text" currently joins the message's `text` parts into a plain
string and writes it with `useClipboard` (`@vueuse/core`). Pasting that
into a rich text target (Word, Google Docs, email clients) loses all
markdown formatting: bold, headings, lists, links, tables, code blocks all
paste as flat text.

## Proposal

Write two clipboard representations at once via the native Clipboard API:

```ts
await navigator.clipboard.write([
  new ClipboardItem({
    'text/plain': new Blob([plainText], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' }),
  }),
]);
```

Rich text targets (Word, Docs) read `text/html` when present and render
it; plain editors and `<input>`/`<textarea>` fields fall back to
`text/plain`. Both blobs need to exist from the same copy action, source
of truth is the same message content either way.

## Getting the HTML: read the rendered DOM, don't re-render markdown

`MessageResponse.vue` already renders each text part's markdown into real
DOM via `vue-stream-markdown` (`~/components/ai-elements/message/MessageResponse.vue`).
Reading that element's `innerHTML` at copy time is simpler and safer than
adding a second markdown-to-HTML pipeline (e.g. `markdown-it` used
directly) that would have to be kept in sync with whatever
`vue-stream-markdown` does under the hood, and it guarantees the copied
HTML always matches exactly what's on screen.

Mechanics:

- Add a ref to each `MessageResponse` instance in `ChatMessage.vue`'s
  `v-for` (only the `v-if="part.type === 'text'"` branch — reasoning, tool,
  and file parts are already excluded from "Copy text" and must stay
  excluded from the HTML too). Vue allows a `ref` on one branch of a
  `v-if`/`v-else-if` chain; it's simply absent for iterations that render a
  different branch.
- At copy time, filter to the refs that exist (skips iterations where a
  different part type rendered) and join their `.innerHTML` in part order,
  the same order `copyText`'s plain-text join already uses.
- The rendered markup carries Tailwind utility classes (from `Markdown`'s
  own styling and any inherited classes). This is harmless noise: Word and
  Google Docs read semantic HTML (`<strong>`, `<ul>`, `<table>`, `<a
  href>`) and inline `style` attributes when deciding how to render pasted
  content, not unrecognized CSS classes from a stylesheet they never
  loaded.

## Fallback

`ClipboardItem` and multi-type `navigator.clipboard.write` aren't
universally supported (older Safari has partial support; some contexts
require a secure origin, which this app already has in every real
deployment). Feature-detect (`typeof ClipboardItem !== 'undefined'`) and
fall back to the current plain-text-only `useClipboard` path when
unavailable, rather than failing the copy action outright.

## Open question

Whether to keep `useClipboard` for the plain-text-only fallback path (so
there's one dependency doing the simple case) or drop it entirely in favor
of always calling the native API directly with a single-type
`ClipboardItem` when HTML isn't available. Leaning toward keeping
`useClipboard` for the fallback, since it's already a proven path and
avoids a second manual permissions/error-handling flow for the same
outcome.
