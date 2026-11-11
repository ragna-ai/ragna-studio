import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { uuidv7 } from 'uuidv7';

// Custom font sizes and spacing tokens; without them `text-body` reads as a colour and `px-card` survives `p-0`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'xxs',
        'title-lg',
        'title',
        'title-sm',
        'body-lg',
        'chat',
        'body',
        'small',
        'caption',
        'mono',
        'mono-sm',
      ],
      spacing: [
        'shell',
        'sidebar',
        'rail',
        'topbar',
        'page',
        'page-bottom',
        'gutter',
        'card',
        'panel',
        'sheet',
        'sheet-lg',
      ],
      shadow: ['popover'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function firstToUpperCase(str: string) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const createPrimaryId = () => uuidv7();

export function createInitials(
  name: string | undefined,
  options: { firstNameOnly?: boolean } = {},
): string {
  if (!name) return '?';
  if (options.firstNameOnly) {
    return name.slice(0, 2);
  }
  return name
    .split(' ')
    .map((n) => n[0])
    .join('');
}
