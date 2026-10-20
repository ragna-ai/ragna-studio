const NON_CONTENT_SELECTORS = ['head', 'style', 'script', 'title', 'noscript', 'template'];
const HIDDEN_STYLE_DECLARATIONS = [
  'display:none',
  'display: none',
  'mso-hide:all',
  'mso-hide: all',
  'max-height:0',
  'max-height: 0',
];

/** Elements no converter should emit: non-visible ones and inline `data:` images. */
export const EXCLUDED_SELECTORS = [
  ...NON_CONTENT_SELECTORS,
  ...HIDDEN_STYLE_DECLARATIONS.map((declaration) => `[style*="${declaration}"]`),
  'img[src^="data:"]',
];
