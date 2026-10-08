import { lexer } from 'marked';
import type { MarkedToken, Token } from 'marked';

export type { Token, Tokens } from 'marked';

/**
 * Narrows a token to marked's own literal-discriminated `MarkedToken` union.
 * marked's `Token` type is `MarkedToken | Tokens.Generic`: `Tokens.Generic`
 * is a catch-all for custom tokenizer extensions registered via
 * `marked.use(...)`, and its `type` field is a plain `string` rather than a
 * literal. Left in place, that `string` type is a candidate match for every
 * `switch (token.type)` case in the writers below, which defeats
 * discriminated-union narrowing (a `case 'heading':` body would see
 * `Heading | Generic` instead of just `Heading`). This package never
 * registers a tokenizer extension, so `Generic` can't occur in practice.
 */
export function asMarkedToken(token: Token): MarkedToken {
  return token as MarkedToken;
}

/**
 * Parses markdown into marked's token tree exactly once:
 * the text, PDF, and docx writers all walk this same tree, so there is
 * never a second parser.
 */
export function parseMarkdownTokens(markdown: string): Token[] {
  return lexer(markdown);
}

// A flat run of styled inline text. Every document writer renders its
// inline content from these spans, never from raw markdown, so
// bold/italic/code/links stay consistent across formats.
export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  linkHref?: string;
}

// Plain, unstyled text of an inline token list. Used only to resolve a
// link's own display text, so a link always renders as one span (its
// styling, if any, comes from its ancestor, not from formatting nested
// inside the link itself).
function innerPlainText(tokens: Token[] | undefined): string {
  if (!tokens) {
    return '';
  }

  return tokens
    .map((rawToken) => {
      const token = asMarkedToken(rawToken);
      switch (token.type) {
        case 'text':
        case 'escape':
        case 'codespan':
          return token.text;
        case 'strong':
        case 'em':
        case 'del':
          return innerPlainText(token.tokens);
        case 'link':
        case 'image':
          return token.text;
        case 'br':
          return '\n';
        default:
          return token.raw;
      }
    })
    .join('');
}

function flattenInlineToken(rawToken: Token, style: Omit<InlineSpan, 'text'>): InlineSpan[] {
  const token = asMarkedToken(rawToken);

  switch (token.type) {
    case 'text':
    case 'escape':
      // A single newline inside a paragraph's source is a "soft break": it's
      // how the source happened to wrap, not an intentional line break, so
      // it renders as a space (matching CommonMark). An intentional break is
      // its own `br` token, handled separately below.
      return [{ text: token.text.replace(/\n/g, ' '), ...style }];
    case 'strong':
      return flattenInline(token.tokens, { ...style, bold: true });
    case 'em':
      return flattenInline(token.tokens, { ...style, italic: true });
    case 'del':
      return flattenInline(token.tokens, { ...style, strike: true });
    case 'codespan':
      return [{ text: token.text, ...style, code: true }];
    case 'link':
      return [{ text: innerPlainText(token.tokens) || token.text, ...style, linkHref: token.href }];
    case 'image':
      // No image support in any writer (out of scope): render its alt text
      // (or, failing that, its URL) as plain text rather than dropping it.
      return [{ text: token.text || token.href, ...style }];
    case 'br':
      return [{ text: '\n', ...style }];
    case 'html':
      // Raw inline HTML has no plain-text meaning worth preserving.
      return [];
    default:
      // Unsupported inline token (docs "Document export" decision 2:
      // "unknown constructs degrade to plain text, never an error").
      return token.raw ? [{ text: token.raw, ...style }] : [];
  }
}

/**
 * Flattens a list of inline tokens (a heading's, paragraph's, or list
 * item's `.tokens`) into a flat run of styled text spans.
 */
export function flattenInline(
  tokens: Token[] | undefined,
  style: Omit<InlineSpan, 'text'> = {},
): InlineSpan[] {
  if (!tokens) {
    return [];
  }

  return tokens.flatMap((token) => flattenInlineToken(token, style));
}
