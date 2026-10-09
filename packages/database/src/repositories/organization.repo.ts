import { createPrimaryId } from '@repo/utils';
import {
  and,
  desc,
  eq,
  exists,
  gt,
  inArray,
  ne,
  not,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { db } from '../db';
import {
  invitation,
  mcpConnection,
  member,
  oauthAccessToken,
  oauthConsent,
  oauthRefreshToken,
  organization,
  session,
  user,
  workspace,
  type Workspace,
} from '../schema';

export const ORGANIZATION_OWNER_ROLE = 'owner';
export const ORGANIZATION_ADMIN_ROLE = 'admin';
const DEFAULT_MEMBER_ROLE = 'member';

/** `users.ban_reason` values that tell our bans apart from a platform-admin ban. */
export const MEMBER_REMOVED_BAN_REASON = 'member_removed';
export const ORGANIZATION_DELETED_BAN_REASON = 'organization_deleted';

/** Roles are comma-separated (`owner,admin`), so compare per role, never the whole string. */
export function hasOrganizationRole(role: string, wanted: string): boolean {
  return role.split(',').some((part) => part.trim() === wanted);
}

/** SQL form of `hasOrganizationRole` for a role column. */
export function organizationRoleMatches(roleColumn: SQL | AnyColumn, wanted: string): SQL {
  return sql`${wanted} = ANY(string_to_array(replace(${roleColumn}, ' ', ''), ','))`;
}

export interface CreatedOrganizationWithWorkspace {
  organizationId: string;
  workspace: Workspace;
}

/** Creates a user's organization, owner membership and Personal workspace in one transaction. */
export async function createOrganizationForUser({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}): Promise<CreatedOrganizationWithWorkspace> {
  return db.transaction(async (tx) => {
    const organizationId = createPrimaryId();

    await tx.insert(organization).values({
      id: organizationId,
      name: userName,
      slug: organizationId,
      createdAt: new Date(),
    });
    await tx.insert(member).values({
      organizationId,
      userId,
      role: ORGANIZATION_OWNER_ROLE,
      createdAt: new Date(),
    });
    const [personalWorkspace] = await tx
      .insert(workspace)
      .values({ organizationId, name: 'Personal' })
      .returning();

    if (!personalWorkspace) {
      throw new Error('Failed to create personal workspace');
    }

    return { organizationId, workspace: personalWorkspace };
  });
}

/**
 * Joins the organization of the newest pending, unexpired invitation for `email`:
 * creates the membership with the invited role and marks the invitation accepted.
 * Returns false when there is none.
 */
export async function joinOrganizationFromPendingInvitation({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [pendingInvitation] = await tx
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.email, email.toLowerCase()),
          eq(invitation.status, 'pending'),
          gt(invitation.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invitation.createdAt))
      .limit(1);

    if (!pendingInvitation) return false;

    await tx.insert(member).values({
      organizationId: pendingInvitation.organizationId,
      userId,
      role: pendingInvitation.role ?? DEFAULT_MEMBER_ROLE,
      createdAt: new Date(),
    });
    await tx
      .update(invitation)
      .set({ status: 'accepted' })
      .where(eq(invitation.id, pendingInvitation.id));

    return true;
  });
}

export async function getOrganizationIdByUserId({
  userId,
}: {
  userId: string;
}): Promise<string | null> {
  const membership = await db.query.member.findFirst({
    where: { userId },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });

  return membership?.organizationId ?? null;
}

/** Deletes the organizations where the user is an owner and no other owner exists. FKs cascade the rest. */
export async function deleteOrganizationsSolelyOwnedByUser({
  userId,
}: {
  userId: string;
}): Promise<void> {
  const otherOwner = db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organization.id),
        organizationRoleMatches(member.role, ORGANIZATION_OWNER_ROLE),
        ne(member.userId, userId),
      ),
    );

  const ownedOrganizationIds = db
    .select({ id: member.organizationId })
    .from(member)
    .where(
      and(eq(member.userId, userId), organizationRoleMatches(member.role, ORGANIZATION_OWNER_ROLE)),
    );

  await db
    .delete(organization)
    .where(and(inArray(organization.id, ownedOrganizationIds), not(exists(otherOwner))));
}

export interface UserMembership {
  memberId: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

/** The user's single membership (one per user), with the organization name. */
export async function getMembershipByUserId({
  userId,
}: {
  userId: string;
}): Promise<UserMembership | null> {
  const [row] = await db
    .select({
      memberId: member.id,
      organizationId: member.organizationId,
      organizationName: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .limit(1);

  return row ?? null;
}

export interface OrganizationMemberRecord {
  memberId: string;
  userId: string;
  role: string;
  deletedAt: Date | null;
  banReason: string | null;
}

export async function getOrganizationMember({
  organizationId,
  memberId,
}: {
  organizationId: string;
  memberId: string;
}): Promise<OrganizationMemberRecord | null> {
  const [row] = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      deletedAt: user.deletedAt,
      banReason: user.banReason,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
    .limit(1);

  return row ?? null;
}

/**
 * Soft-deletes a member account: bans it, ends its sessions and revokes its MCP access.
 * The member row stays so the account can be restored.
 */
export async function softDeleteMemberAccount({ userId }: { userId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ deletedAt: new Date(), banned: true, banReason: MEMBER_REMOVED_BAN_REASON })
      .where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(mcpConnection).where(eq(mcpConnection.userId, userId));
    // Access tokens reference refresh tokens (no cascade), so they go first.
    await tx.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId));
    await tx.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId));
    await tx.delete(oauthConsent).where(eq(oauthConsent.userId, userId));
  });
}

export async function restoreMemberAccount({ userId }: { userId: string }): Promise<void> {
  await db
    .update(user)
    .set({ deletedAt: null, banned: false, banReason: null })
    .where(eq(user.id, userId));
}

/** Swaps roles in one transaction: the target becomes owner, the current owner becomes admin. */
export async function transferOrganizationOwnership({
  currentOwnerMemberId,
  newOwnerMemberId,
}: {
  currentOwnerMemberId: string;
  newOwnerMemberId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(member)
      .set({ role: ORGANIZATION_OWNER_ROLE })
      .where(eq(member.id, newOwnerMemberId));
    await tx
      .update(member)
      .set({ role: ORGANIZATION_ADMIN_ROLE })
      .where(eq(member.id, currentOwnerMemberId));
  });
}
