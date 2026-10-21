const isMacOs =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

const MAC_KEY_SYMBOLS: Readonly<Record<string, string>> = {
  Mod: '⌘',
  Shift: '⇧',
  Alt: '⌥',
};

const OTHER_KEY_NAMES: Readonly<Record<string, string>> = {
  Mod: 'Ctrl',
};

/** Turns a Tiptap shortcut such as `Mod-Shift-s` into `⌘⇧S` (macOS) or `Ctrl+Shift+S`. */
export function formatShortcut(shortcut: string): string {
  const keys = shortcut.split('-').map((key) => {
    if (key.length === 1) return key.toUpperCase();
    return (isMacOs ? MAC_KEY_SYMBOLS : OTHER_KEY_NAMES)[key] ?? key;
  });
  return isMacOs ? keys.join('') : keys.join('+');
}

/** Appends the platform shortcut to a label, for example `Bold (⌘B)`. */
export function labelWithShortcut(label: string, shortcut: string): string {
  return `${label} (${formatShortcut(shortcut)})`;
}
