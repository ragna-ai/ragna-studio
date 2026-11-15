import type { LocalizedContent } from './types';

export interface PasskeyAddedVariables {
  userName: string;
  passkeyName: string;
  settingsUrl: string;
}

export const passkeyAddedContent = {
  en: ({ userName, passkeyName, settingsUrl }) => {
    const added = `A passkey named ${passkeyName} was added to your account.`;
    return {
      subject: 'A passkey was added to your RAGNA Studio account',
      preheader: added,
      heading: `Hi ${userName},`,
      paragraphs: [added, "If this wasn't you, remove it in your passkey settings and sign out."],
      action: { label: 'Open passkey settings', url: settingsUrl },
      footerReason: 'to let you know about an important change to your account.',
    };
  },
  de: ({ userName, passkeyName, settingsUrl }) => {
    const added = `Ein Passkey namens ${passkeyName} wurde zu deinem Konto hinzugefügt.`;
    return {
      subject: 'Neuer Passkey in deinem Konto bei RAGNA Studio',
      preheader: added,
      heading: `Hallo ${userName},`,
      paragraphs: [
        added,
        'Warst du das nicht? Entferne ihn in deinen Passkey-Einstellungen und melde dich ab.',
      ],
      action: { label: 'Passkey-Einstellungen öffnen', url: settingsUrl },
      footerReason: 'um dich über eine wichtige Änderung an deinem Konto zu informieren.',
    };
  },
} satisfies LocalizedContent<PasskeyAddedVariables>;
