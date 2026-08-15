// packages/mail/src/content/sanitize-html.ts
//
// `sanitizeQuotedHtml` makes untrusted sender HTML safe to embed inside a
// NEW draft the user is about to edit and send (reply-quote.ts's
// `buildReplyQuoteHtml`). It is not a general-purpose sanitizer and not
// named `sanitizeHtml` on purpose: the caller isn't rendering someone
// else's mail read-only (that's apps/web's iframe path), it's splicing
// their HTML into a document the user's own Tiptap instance will parse and
// the user will then send onward, so the same untrusted-markup rules apply
// as for display.
//
// This config is a DELIBERATE, BYTE-FOR-BYTE MIRROR of
// apps/web/app/utils/dompurify.ts's `sanitizeHtmlForIframe`. It is not
// shared code: `@repo/mail` runs in apps/api and apps/worker, neither of
// which can depend on apps/web. If that file's config ever changes
// (FORBID_TAGS, FORBID_ATTR, the link-hardening hook, anything), this one
// must change with it by hand — two independent sanitizer configs that are
// supposed to agree are worse than one, so keeping them identical is a
// review discipline, not something the type system enforces for you.

import DOMPurify from 'isomorphic-dompurify';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A' || !node.hasAttribute('href')) {
    return;
  }
  // Open external links in a new tab/window.
  node.setAttribute('target', '_blank');
  // Prevent the opened page from accessing window.opener.
  node.setAttribute('rel', 'noopener noreferrer');
});

export function sanitizeQuotedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    // Protect against hostile id/name values in untrusted markup.
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
    // Allow <base> tags in the iframe, so that relative links can be resolved correctly.
    ADD_TAGS: ['base'],
    ADD_ATTR: ['target', 'rel'],
    // Intentionally do NOT forbid "style":
    // email HTML commonly needs <style>...</style> and style="" attributes.
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'select',
      'textarea',
      'base',
      'meta',
      'link', // Prevents external stylesheets and resource preloads.
      'audio',
      'video',
      'source',
      'track',
    ],
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover'],
  });
}
