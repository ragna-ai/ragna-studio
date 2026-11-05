import { describe, expect, test } from 'bun:test';
import { createRichTextEditorExtensions } from '../src/kit';
import { getEnabledRuleExtensions } from '../src/typing-rules';
import { EDITOR_PROFILES, getEditorProfile } from '../src/profiles';

describe('editor profiles', () => {
  test('prompt menus leave out image and task list', () => {
    const { slashCommands, blockToggles } = EDITOR_PROFILES.prompt;
    expect(slashCommands).not.toContain('image');
    expect(slashCommands).not.toContain('taskList');
    expect(blockToggles).not.toContain('taskList');
  });

  test('prompt keeps the remaining slash commands in menu order', () => {
    expect(EDITOR_PROFILES.prompt.slashCommands).toEqual([
      'paragraph',
      'h1',
      'h2',
      'h3',
      'h4',
      'bulletList',
      'orderedList',
      'blockquote',
      'codeBlock',
      'horizontalRule',
      'table',
    ]);
    expect(EDITOR_PROFILES.prompt.blockToggles).toEqual([
      'bulletList',
      'orderedList',
      'blockquote',
      'codeBlock',
    ]);
  });

  test('document and email offer every command', () => {
    for (const profile of [EDITOR_PROFILES.document, EDITOR_PROFILES.email]) {
      expect(profile.slashCommands).toContain('image');
      expect(profile.slashCommands).toContain('taskList');
      expect(profile.blockToggles).toContain('taskList');
    }
  });

  test('document and prompt store markdown, email stores html', () => {
    expect(getEditorProfile('document').contentType).toBe('markdown');
    expect(getEditorProfile('prompt').contentType).toBe('markdown');
    expect(getEditorProfile('email').contentType).toBe('html');
  });

  test('prompt loads no typography extension, document still does', () => {
    const namesFor = (id: 'prompt' | 'document') =>
      createRichTextEditorExtensions({
        smartTypography: EDITOR_PROFILES[id].smartTypography,
      }).map((extension) => extension.name);
    expect(namesFor('prompt')).not.toContain('typography');
    expect(namesFor('document')).toContain('typography');
  });

  test('prompt keeps block shortcuts and drops mark shortcuts', () => {
    const extensions = createRichTextEditorExtensions({ hasMarkdown: true });
    const enabled = getEnabledRuleExtensions(extensions, EDITOR_PROFILES.prompt.markShortcuts);
    expect(enabled).toEqual(expect.arrayContaining(['heading', 'bulletList', 'blockquote']));
    for (const mark of ['bold', 'italic', 'strike', 'code', 'link']) {
      expect(enabled).not.toContain(mark);
    }
  });

  test('document keeps every shortcut', () => {
    const extensions = createRichTextEditorExtensions({ hasMarkdown: true });
    expect(getEnabledRuleExtensions(extensions, EDITOR_PROFILES.document.markShortcuts)).toBe(true);
  });
});
