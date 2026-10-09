import { config } from '@repo/config';
import { getUserByEmail, hasOrganizationRole, ORGANIZATION_OWNER_ROLE } from '@repo/database';
import { logger } from '@repo/logger';
import { INVITATION_EMAIL_JOB, invitationEmailJobSchema, queue } from '@repo/queue';
import { APIError } from 'better-auth/api';

interface CreatedInvitation {
  email: string;
  role: string;
}

interface InvitationToValidate {
  invitation: CreatedInvitation;
}

interface InvitationEmailInput {
  id: string;
  email: string;
  inviter: { user: { name: string } };
  organization: { name: string };
}

interface RoleChange {
  newRole: string;
}

function rejectInvitation(message: string): never {
  throw new APIError('BAD_REQUEST', { message });
}

function rejectOwnerRole(role: string): void {
  if (hasOrganizationRole(role, ORGANIZATION_OWNER_ROLE)) {
    rejectInvitation('The owner role cannot be granted. Transfer ownership instead.');
  }
}

/** Runs before the plugin stores an invitation. Add new rejection reasons here. */
export async function validateInvitation({ invitation }: InvitationToValidate): Promise<void> {
  rejectOwnerRole(invitation.role);

  const email = invitation.email.toLowerCase();
  const allowedEmails = config.allowedLoginEmails;
  if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
    rejectInvitation('This email is not permitted to sign in.');
  }

  if (await getUserByEmail({ email })) {
    rejectInvitation('This person already has an account.');
  }
}

export async function rejectOwnerRoleChange({ newRole }: RoleChange): Promise<void> {
  rejectOwnerRole(newRole);
}

export async function enqueueInvitationEmail({
  id,
  email,
  inviter,
  organization,
}: InvitationEmailInput): Promise<void> {
  if (config.isTest) return;

  try {
    await queue.email().add(
      INVITATION_EMAIL_JOB,
      invitationEmailJobSchema.parse({
        email,
        inviterName: inviter.user.name,
        organizationName: organization.name,
        url: `${config.appUrl}/auth/login?invitation=${id}`,
      }),
    );
  } catch (error) {
    logger.error('Failed to enqueue invitation email', { invitationId: id, error });
  }
}
