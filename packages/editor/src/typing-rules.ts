import { flattenExtensions, type AnyExtension, type EnableRules } from '@tiptap/core';

/**
 * Names of the extensions whose typed and pasted markdown shortcuts stay on.
 * Without `markShortcuts`, every mark loses its shortcuts (`*x*`, `**x**`,
 * `~~x~~`, backticks, `[x](url)`). Nodes keep theirs (`# `, `- `, `> `).
 */
export function getEnabledRuleExtensions(
  extensions: AnyExtension[],
  markShortcuts: boolean,
): EnableRules {
  if (markShortcuts) return true;
  return flattenExtensions(extensions)
    .filter((extension) => extension.type !== 'mark')
    .map((extension) => extension.name);
}
