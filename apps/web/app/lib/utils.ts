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
