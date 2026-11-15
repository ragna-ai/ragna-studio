import type { UserLocale } from '@repo/utils';

/** The footer sentence, split around the address so the template can keep the address on one line. */
export interface RecipientLine {
  beforeAddress: string;
  address: string;
  afterAddress: string;
}

const recipientLineFrames: Record<
  UserLocale,
  (address: string, footerReason: string) => RecipientLine
> = {
  en: (address, footerReason) => ({
    beforeAddress: 'This email was sent to ',
    address,
    afterAddress: ` ${footerReason}`,
  }),
  de: (address, footerReason) => ({
    beforeAddress: 'Diese E-Mail wurde an ',
    address,
    afterAddress: ` gesendet, ${footerReason}`,
  }),
};

export function buildRecipientLine(
  locale: UserLocale,
  address: string,
  footerReason: string,
): RecipientLine {
  return recipientLineFrames[locale](address, footerReason);
}
