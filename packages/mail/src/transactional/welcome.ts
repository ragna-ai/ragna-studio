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
    footerReason: 'because you created a RAGNA Studio account.',
  }),
  de: ({ name }) => ({
    subject: 'Willkommen bei RAGNA Studio',
    preheader: 'Schön, dass du bei RAGNA Studio bist.',
    heading: `Willkommen, ${name}.`,
    paragraphs: ['Schön, dass du bei RAGNA Studio bist.'],
    footerReason: 'weil du ein Konto bei RAGNA Studio erstellt hast.',
  }),
} satisfies LocalizedContent<WelcomeVariables>;
