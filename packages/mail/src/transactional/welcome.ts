import type { LocalizedContent } from './types';

export interface WelcomeVariables {
  name: string;
}

export const welcomeContent = {
  en: ({ name }) => ({
    subject: 'Welcome to RAGNA Studio',
    preheader: 'Thanks for joining RAGNA Studio.',
    heading: `Welcome, ${name}.`,
    paragraphs: ['Thanks for joining RAGNA Studio.'],
  }),
  de: ({ name }) => ({
    subject: 'Willkommen bei RAGNA Studio',
    preheader: 'Schön, dass du bei RAGNA Studio bist.',
    heading: `Willkommen, ${name}.`,
    paragraphs: ['Schön, dass du bei RAGNA Studio bist.'],
  }),
} satisfies LocalizedContent<WelcomeVariables>;
