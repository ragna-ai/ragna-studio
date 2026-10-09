export function buildInvitationLink(invitationId: string): string {
  return `${window.location.origin}/auth/login?invitation=${invitationId}`;
}
