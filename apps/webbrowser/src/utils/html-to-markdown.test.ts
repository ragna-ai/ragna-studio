import { describe, expect, test } from 'bun:test';
import { MAX_MARKDOWN_LENGTH, toMarkdown } from './html-to-markdown';

describe('toMarkdown', () => {
  test('renders headings as ATX markdown', () => {
    expect(toMarkdown('<h1>Title</h1><h2>Sub</h2>')).toContain('# Title');
    expect(toMarkdown('<h2>Sub</h2>')).toContain('## Sub');
  });

  test('renders links as inline markdown links', () => {
    expect(toMarkdown('<a href="https://example.com/a">Example</a>')).toContain(
      '[Example](https://example.com/a)',
    );
  });

  test('renders unordered lists', () => {
    const markdown = toMarkdown('<ul><li>one</li><li>two</li></ul>');
    expect(markdown).toMatch(/^[-*]\s+one$/m);
    expect(markdown).toMatch(/^[-*]\s+two$/m);
  });

  test('renders tables as GFM tables', () => {
    const markdown = toMarkdown(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(markdown).toMatch(/\|\s*A\s*\|\s*B\s*\|/);
    expect(markdown).toMatch(/\|\s*-+\s*\|\s*-+\s*\|/);
    expect(markdown).toMatch(/\|\s*1\s*\|\s*2\s*\|/);
  });

  test('drops inline data: images', () => {
    const markdown = toMarkdown(
      '<p>before</p><img src="data:image/png;base64,AAAA" alt="pic"><p>after</p>',
    );
    expect(markdown).not.toContain('base64');
    expect(markdown).toContain('before');
    expect(markdown).toContain('after');
  });

  test('keeps images with a regular URL', () => {
    expect(toMarkdown('<img src="https://example.com/a.png" alt="pic">')).toContain(
      'https://example.com/a.png',
    );
  });

  test('caps output at the maximum length', () => {
    const markdown = toMarkdown('<p>hello world</p>'.repeat(5_000));
    expect(markdown.length).toBeLessThanOrEqual(MAX_MARKDOWN_LENGTH);
    expect(markdown.length).toBeGreaterThan(MAX_MARKDOWN_LENGTH / 2);
  });

  test('removes blank lines', () => {
    const markdown = toMarkdown('<p>one</p><p>two</p><p>three</p>');
    expect(markdown).not.toMatch(/\n\s*\n/);
    expect(markdown).toContain('one');
    expect(markdown).toContain('three');
  });
});
