import type { EmailParticipant, EmailThreadSummary } from '~/features/email/types';

/** "Jane Doe" if a display name is known, else the bare address. */
export function formatParticipant(participant: EmailParticipant): string {
  return participant.name?.trim() || participant.email;
}

export function formatParticipantList(participants: EmailParticipant[]): string {
  return participants.map(formatParticipant).join(', ');
}

/** Up to two initials for an avatar fallback, from a name or an email's local part. */
export function participantInitials(participant: EmailParticipant): string {
  const source = participant.name?.trim() || participant.email.split('@')[0] || '?';
  const parts = source.split(/[\s.]+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0]?.[0]}${parts[1]?.[0]}` : source.slice(0, 2);
  return initials.toUpperCase();
}

/** Thread-list row subtitle: every participant except the account owner would need the owner's own address, which the list response doesn't carry, so this just joins everyone denormalized on the thread. */
export function threadParticipantsLabel(thread: EmailThreadSummary): string {
  return formatParticipantList(thread.participants);
}
