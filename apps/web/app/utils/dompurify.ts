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

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

export interface SanitizedIframeHtml {
  headHtml: string;
  bodyHtml: string;
}

export function sanitizeHtmlForIframe(html: string): SanitizedIframeHtml {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    // Keep <head> (e.g. newsletter <style> blocks) instead of dropping it:
    // DOMPurify only returns <body>'s innerHTML unless this is set.
    WHOLE_DOCUMENT: true,
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

  const doc = new DOMParser().parseFromString(clean, 'text/html');
  return {
    headHtml: doc.head.innerHTML,
    bodyHtml: doc.body.innerHTML,
  };
}
