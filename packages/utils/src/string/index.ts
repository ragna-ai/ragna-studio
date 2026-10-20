// export function escapeHtml(text: string | null | undefined): string {
//   if (!text) return '';
//   return he.escape(text);
// }

// Blank lines separate paragraphs, single newlines become line breaks. Escaped
// because the text is usually model- or user-written and ends up in sent HTML.
// export function textToHtmlParagraphs(text?: string | null): string {
//   if (!text) return '';

//   return text
//     .replace(/\r\n/g, '\n')
//     .split(/\n{2,}/)
//     .map((paragraph) => paragraph.trim())
//     .filter((paragraph) => paragraph !== '')
//     .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
//     .join('');
// }

export function truncate(str: string, length: number) {
  return str.length > length ? `${str.slice(0, length)}...` : str;
}

export function trimToNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return;

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export function removeExcessiveWhitespace(str: string) {
  return (
    str
      // First remove all zero-width spaces, soft hyphens, and other invisible characters
      // Handle each special character separately to avoid combining character issues
      .replace(/\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF|\u3164|\u00AD|\u034F/g, ' ')
      // Normalize all types of line breaks to \n
      .replace(/\r\n|\r/g, '\n')
      // Collapse spaces first: the patterns below would otherwise backtrack
      // over long space runs in quadratic time on pathological input
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      // Collapse 3 or more newlines into double newlines
      .replace(/\n{3,}/g, '\n\n')
      // Clean up any trailing/leading whitespace
      .trim()
  );
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export function formatBulletList(list: string[]) {
  return list.map((item) => `- ${item}`).join('\n');
}

export function convertNewlinesToBr(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
}
