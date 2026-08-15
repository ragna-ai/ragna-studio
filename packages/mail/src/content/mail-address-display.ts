// packages/mail/src/content/mail-address-display.ts
//
// Shared "Name <email>" rendering for the content utilities that attribute
// text to a sender (thread-prompt.ts, reply-quote.ts).

import type { MailAddress } from '../provider/mail-provider';

export function formatMailAddress(address: MailAddress): string {
  return address.name ? `${address.name} <${address.address}>` : address.address;
}
