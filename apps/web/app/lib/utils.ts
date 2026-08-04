import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { uuidv7 } from 'uuidv7';

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
