const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Strips any markup a search snippet might carry, so it's never trusted as
 * HTML. Highlighting is redone client-side against the known search query
 * instead (see `splitForHighlight`), which sidesteps trusting server-provided
 * markup on user-generated message content entirely.
 */
export function stripMarkup(text: string): string {
  return text.replace(HTML_TAG_PATTERN, '');
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits `text` into plain/matched segments around every case-insensitive
 * occurrence of `query`, for Google-style match highlighting
 * (docs/chat/search-prd.md, "Result layout").
 */
export function splitForHighlight(
  text: string,
  query: string,
): HighlightSegment[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [{ text, matched: false }];
  }

  const pattern = new RegExp(`(${escapeForRegExp(trimmedQuery)})`, 'gi');
  const lowerQuery = trimmedQuery.toLowerCase();

  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, matched: part.toLowerCase() === lowerQuery }));
}
