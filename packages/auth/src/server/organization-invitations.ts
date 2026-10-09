import { config } from '@repo/config';
import {
  getMembershipByUserId,
  getOrganizationIdByUserId,
  getUserByEmail,
  hasOrganizationRole,
  ORGANIZATION_ADMIN_ROLE,
  ORGANIZATION_OWNER_ROLE,
} from '@repo/database';
import { logger } from '@repo/logger';
import { INVITATION_EMAIL_JOB, invitationEmailJobSchema, queue } from '@repo/queue';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';

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

  const existingUser = await getUserByEmail({ email });
  if (!existingUser) return;
  if (existingUser.deletedAt) {
    rejectInvitation("This person's account is scheduled for deletion.");
  }
  rejectInvitation('This person already has an account.');
}

interface InviteMemberBody {
  email: string;
  organizationId?: string;
}

function readInviteMemberBody(body: unknown): InviteMemberBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const { email, organizationId } = body as Record<string, unknown>;
  if (typeof email !== 'string') return null;
  return { email, organizationId: typeof organizationId === 'string' ? organizationId : undefined };
}

/**
 * The plugin answers "already a member" before `beforeCreateInvitation` runs,
 * so the removed-member hint has to come from a hook ahead of the route.
 * Only owners and admins of that organization see it.
 */
export const rejectInvitingRemovedMember = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/organization/invite-member') return;

  const body = readInviteMemberBody(ctx.body);
  const session = await getSessionFromCtx(ctx);
  if (!body || !session) return;

  const membership = await getMembershipByUserId({ userId: session.user.id });
  const organizationId = body.organizationId ?? membership?.organizationId;
  if (!membership || membership.organizationId !== organizationId) return;
  const mayInvite =
    hasOrganizationRole(membership.role, ORGANIZATION_OWNER_ROLE) ||
    hasOrganizationRole(membership.role, ORGANIZATION_ADMIN_ROLE);
  if (!mayInvite) return;

  const invitee = await getUserByEmail({ email: body.email.toLowerCase() });
  if (!invitee?.deletedAt) return;
  if ((await getOrganizationIdByUserId({ userId: invitee.id })) !== organizationId) return;

  rejectInvitation('This person was removed. Restore them in the member list.');
});

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
