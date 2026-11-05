import { describe, expect, test } from 'bun:test';
import { createMarkdownManager } from './markdown-manager';

const ROUND_TRIP_CASES: Record<string, string> = {
  'block xml tags': '<instructions>\nBe brief.\n</instructions>',
  'inline xml tags': 'Answer in <language>German</language> only.',
  'variables with underscores': 'Hello {{user_name}}, your id is {{order_id}}.',
  'snake case words': 'Use the snake_case name and my_var_name literally.',
  'asterisk math': '2 * 3 = 6 and 4 * 5 = 20',
  image: '![a cat](https://example.com/cat.png)',
  'task list': '- [ ] open\n- [x] done',
  headings: '# One\n\n## Two\n\n### Three',
  lists: '- a\n- b\n\n1. first\n2. second',
  'fenced code block': '```ts\nconst a = "<b>" * 2;\n```',
};

describe('prompt profile text', () => {
  const manager = createMarkdownManager('prompt');

  for (const [name, markdown] of Object.entries(ROUND_TRIP_CASES)) {
    test(`round-trips ${name} unchanged`, () => {
      const once = manager.serialize(manager.parse(markdown));
      expect(once).toBe(markdown);
      const twice = manager.serialize(manager.parse(once));
      expect(twice).toBe(once);
    });
  }
});

describe('prompt profile tables', () => {
  const manager = createMarkdownManager('prompt');
  const table = '| a | b |\n| --- | --- |\n| {{x}} | <y> |';

  test('keeps variables and tags in cells', () => {
    const output = manager.serialize(manager.parse(table));
    expect(output).toContain('| {{x}} | <y> |');
  });

  test('is stable after the first pass', () => {
    const once = manager.serialize(manager.parse(table));
    expect(manager.serialize(manager.parse(once))).toBe(once);
  });
});

describe('document profile text', () => {
  test('still escapes underscores', () => {
    const manager = createMarkdownManager('document');
    const output = manager.serialize(manager.parse('Use snake_case here'));
    expect(output).toBe('Use snake\\_case here');
  });

  test('is not affected by a prompt manager', () => {
    createMarkdownManager('prompt');
    const manager = createMarkdownManager('document');
    expect(manager.serialize(manager.parse('a_b'))).toBe('a\\_b');
  });
});
