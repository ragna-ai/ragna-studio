// Guards against a draft whose `content` can hang the editable
// Tiptap/ProseMirror instance's hydration (contenteditable chokes on one
// huge unbroken run of text in a way plain read-only rendering doesn't).
// Confirmed trigger: an HTML newsletter that turndown collapsed into a
// single 80,520-character line when quoted into a reply draft (back when
// `content` was markdown; the same line-length shape still applies now that
// `content` is HTML - docs/email/html-content-change-request.md, "What
// becomes dead code"). Not just a theoretical edge case - drafts reconciled
// from the user's real Gmail account carry whatever body Gmail has, and rows
// with single lines over 10,000 characters already exist. EmailComposer.vue
// checks this before ever constructing the editable editor; see its guard
// for what happens when a draft trips one of these limits.

/** A single line longer than this is unsafe to hydrate into the editable editor. */
export const EMAIL_DRAFT_MAX_LINE_LENGTH = 5_000;

/** Total content longer than this is unsafe to hydrate into the editable editor, even with no single huge line. */
export const EMAIL_DRAFT_MAX_CONTENT_LENGTH = 100_000;

/** True when `content` should be shown read-only instead of loaded into the editable composer. */
export function isEmailDraftContentUnsafeToEdit(content: string): boolean {
  if (content.length > EMAIL_DRAFT_MAX_CONTENT_LENGTH) return true;
  return content.split('\n').some((line) => line.length > EMAIL_DRAFT_MAX_LINE_LENGTH);
}
