// apps/worker/src/mail/participants.ts
//
// Denormalized thread fields: subject,
// snippet, and participants for the list view, derived from the provider's
// message metadata rather than stored separately.

import type { EmailParticipant } from '@repo/database';
import type { MailAddress, MailMessageMetadata } from '@repo/mail/provider';

export interface ThreadSummary {
  subject: string | null;
  snippet: string | null;
  lastMessageAt: Date;
  participants: EmailParticipant[];
}

function toEmailParticipant(address: MailAddress): EmailParticipant {
  return { name: address.name ?? null, email: address.address };
}

// Providers always set a From header in practice; this only satisfies the
// provider type's null case at the type level.
const UNKNOWN_SENDER: EmailParticipant = { name: null, email: 'unknown' };

export function fromParticipant(address: MailAddress | null): EmailParticipant {
  return address ? toEmailParticipant(address) : UNKNOWN_SENDER;
}

export function toParticipants(addresses: MailAddress[]): EmailParticipant[] {
  return addresses.map(toEmailParticipant);
}

// The reverse mapping: @repo/mail/content's formatThreadForPrompt takes
// `from` as a MailAddress (the provider's own address shape), not our
// stored EmailParticipant, so classify/draft need this to build prompt
// input from a DB row.
export function toMailAddress(participant: EmailParticipant): MailAddress {
  return { name: participant.name ?? undefined, address: participant.email };
}

// Dedupes by lowercased address, keeping the first-seen display name. Called
// with a single message for an incremental sync ('added' events only see
// the new message) and with every message in a thread for the seed import,
// where it produces the thread's full participant list for free since
// fetchThread already returned every message: compute once from what was
// fetched anyway.
function collectParticipants(messages: MailMessageMetadata[]): EmailParticipant[] {
  const byEmail = new Map<string, EmailParticipant>();

  for (const message of messages) {
    const addresses = [message.from, ...message.to, ...message.cc].filter(
      (address): address is MailAddress => address !== null,
    );

    for (const address of addresses) {
      const key = address.address.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, toEmailParticipant(address));
      }
    }
  }

  return [...byEmail.values()];
}

// Summarizes a set of messages belonging to the same thread into the
// denormalized fields upserted onto email_threads: subject/snippet/
// lastMessageAt come from the most recent message, participants are the
// dedup'd union across all of them.
export function summarizeThread(messages: MailMessageMetadata[]): ThreadSummary {
  const latest = messages.reduce((newest, message) => (message.date > newest.date ? message : newest));

  return {
    subject: latest.subject,
    snippet: latest.snippet,
    lastMessageAt: latest.date,
    participants: collectParticipants(messages),
  };
}
