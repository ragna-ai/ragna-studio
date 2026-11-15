import type { LocalizedContent } from './types';

export interface InvitationVariables {
  inviterName: string;
  organizationName: string;
  url: string;
}

export const invitationContent = {
  en: ({ inviterName, organizationName, url }) => {
    const intro = `${inviterName} invited you to join ${organizationName}.`;
    return {
      subject: `${inviterName} invited you to ${organizationName}`,
      preheader: 'Sign in with this email address to join.',
      heading: intro,
      paragraphs: ['Sign in with this email address to join.'],
      action: { label: `Join ${organizationName}`, url },
    };
  },
  de: ({ inviterName, organizationName, url }) => {
    const intro = `${inviterName} hat dich eingeladen, ${organizationName} beizutreten.`;
    return {
      subject: `${inviterName} hat dich zu ${organizationName} eingeladen`,
      preheader: 'Melde dich mit dieser E-Mail-Adresse an.',
      heading: intro,
      paragraphs: ['Melde dich mit dieser E-Mail-Adresse an.'],
      action: { label: `${organizationName} beitreten`, url },
    };
  },
} satisfies LocalizedContent<InvitationVariables>;
