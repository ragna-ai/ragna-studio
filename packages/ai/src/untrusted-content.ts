const TAG_NAME_PATTERN = /^[a-z][a-z_]*$/;

/**
 * Wraps text the model must read as data, such as an email or a task, in `<tag>` and `</tag>`.
 * The text can't end the block early: every opening or closing form of the same tag inside it is
 * escaped. Nothing else is escaped, so markdown, code and angle brackets reach the model as written.
 */
export function wrapUntrustedContent(tag: string, text: string): string {
  if (!TAG_NAME_PATTERN.test(tag)) {
    throw new Error(`Invalid tag name for untrusted content: ${tag}`);
  }
  const ownTag = new RegExp(`<(/?${tag}\\b)`, 'gi');
  return `<${tag}>\n${text.replaceAll(ownTag, '&lt;$1')}\n</${tag}>`;
}
