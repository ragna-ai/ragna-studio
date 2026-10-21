import { Extension } from '@tiptap/core';

const LEGACY_DELIMITER_PATTERNS = [/^\+\+(?=\S)([\s\S]*?\S)\+\+/, /^==(?=\S)([^=]*[^=\s])==/];

/**
 * Parse-only support for the `++text++` (underline) and `==text==` (highlight)
 * syntax that older saves contain. The inner text is kept, the marks are gone.
 * Delimiters must hug non-whitespace so text like "C++ and C++" is left alone.
 */
export const LegacyMarks = Extension.create({
  name: 'legacyMarks',

  markdownTokenizer: {
    name: 'legacyMarks',
    level: 'inline',
    start(src: string) {
      const indexes = ['++', '=='].map((delimiter) => src.indexOf(delimiter)).filter((i) => i >= 0);
      return indexes.length > 0 ? Math.min(...indexes) : -1;
    },
    tokenize(src: string, _tokens: unknown, lexer) {
      for (const pattern of LEGACY_DELIMITER_PATTERNS) {
        const match = pattern.exec(src);
        if (!match) continue;
        const innerText = match[1];
        return {
          type: 'legacyMarks',
          raw: match[0],
          text: innerText,
          tokens: lexer.inlineTokens(innerText),
        };
      }
      return undefined;
    },
  },
});
