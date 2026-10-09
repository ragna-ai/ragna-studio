import { createPrimaryId } from '@repo/utils';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notExists,
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
 * Joins the active organization of the newest pending, unexpired invitation for `email`:
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
    const [row] = await tx
      .select({ pendingInvitation: invitation })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(
        and(
          eq(invitation.email, email.toLowerCase()),
          eq(invitation.status, 'pending'),
          gt(invitation.expiresAt, new Date()),
          isNull(organization.deletedAt),
        ),
      )
      .orderBy(desc(invitation.createdAt))
      .limit(1);

    if (!row) return false;
    const { pendingInvitation } = row;

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

export interface OwnedOrganization {
  organizationId: string;
  hasOtherActiveMembers: boolean;
}

/** The organization the user owns, and whether anyone but them still has access to it. */
export async function getOwnedOrganization({
  userId,
}: {
  userId: string;
}): Promise<OwnedOrganization | null> {
  const [owned] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(
      and(eq(member.userId, userId), organizationRoleMatches(member.role, ORGANIZATION_OWNER_ROLE)),
    )
    .limit(1);

  if (!owned) return null;

  const [otherActiveMember] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, owned.organizationId),
        ne(member.userId, userId),
        isNull(user.deletedAt),
      ),
    )
    .limit(1);

  return {
    organizationId: owned.organizationId,
    hasOtherActiveMembers: Boolean(otherActiveMember),
  };
}

export async function markOrganizationDeleted({
  organizationId,
}: {
  organizationId: string;
}): Promise<void> {
  await db
    .update(organization)
    .set({ deletedAt: new Date() })
    .where(eq(organization.id, organizationId));
}

export interface UserMembership {
  memberId: string;
  organizationId: string;
  organizationName: string;
  organizationDeletedAt: Date | null;
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
      organizationDeletedAt: organization.deletedAt,
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

type OrganizationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function revokeMcpAccess(tx: OrganizationTransaction, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await tx.delete(mcpConnection).where(inArray(mcpConnection.userId, userIds));
  // Access tokens reference refresh tokens (no cascade), so they go first.
  await tx.delete(oauthAccessToken).where(inArray(oauthAccessToken.userId, userIds));
  await tx.delete(oauthRefreshToken).where(inArray(oauthRefreshToken.userId, userIds));
  await tx.delete(oauthConsent).where(inArray(oauthConsent.userId, userIds));
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
    await revokeMcpAccess(tx, [userId]);
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

/**
 * Soft-deletes an organization in one transaction: every other active member is banned and
 * signed out, MCP access of all members (owner included) is revoked, pending invitations are canceled.
 * The owner keeps their account so they can restore.
 */
export async function softDeleteOrganization({
  organizationId,
}: {
  organizationId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const members = await tx
      .select({
        userId: member.userId,
        role: member.role,
        deletedAt: user.deletedAt,
        banned: user.banned,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId));

    // Already-banned accounts (removed members, platform bans) keep their own reason.
    const userIdsToBan = members
      .filter(
        (row) =>
          !hasOrganizationRole(row.role, ORGANIZATION_OWNER_ROLE) &&
          row.deletedAt === null &&
          !row.banned,
      )
      .map((row) => row.userId);

    await tx
      .update(organization)
      .set({ deletedAt: new Date() })
      .where(eq(organization.id, organizationId));

    if (userIdsToBan.length > 0) {
      await tx
        .update(user)
        .set({ deletedAt: new Date(), banned: true, banReason: ORGANIZATION_DELETED_BAN_REASON })
        .where(inArray(user.id, userIdsToBan));
      await tx.delete(session).where(inArray(session.userId, userIdsToBan));
    }

    await revokeMcpAccess(
      tx,
      members.map((row) => row.userId),
    );
    await tx
      .update(invitation)
      .set({ status: 'canceled' })
      .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending')));
  });
}

/** Restores the organization and only the members its deletion banned. */
export async function restoreOrganization({
  organizationId,
}: {
  organizationId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(organization)
      .set({ deletedAt: null })
      .where(eq(organization.id, organizationId));
    await tx
      .update(user)
      .set({ deletedAt: null, banned: false, banReason: null })
      .where(
        and(
          eq(user.banReason, ORGANIZATION_DELETED_BAN_REASON),
          inArray(
            user.id,
            tx
              .select({ id: member.userId })
              .from(member)
              .where(eq(member.organizationId, organizationId)),
          ),
        ),
      );
  });
}

// PURGE

export async function listOrganizationIdsDeletedBefore({
  date,
}: {
  date: Date;
}): Promise<string[]> {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(lt(organization.deletedAt, date))
    .orderBy(organization.deletedAt);

  return rows.map((row) => row.id);
}

/** Soft-deleted users whose organization is not itself deleted (that purge covers them). */
export async function listUserIdsDeletedBefore({ date }: { date: Date }): Promise<string[]> {
  const inDeletedOrganization = db
    .select({ id: member.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, user.id), isNotNull(organization.deletedAt)));

  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(lt(user.deletedAt, date), notExists(inDeletedOrganization)))
    .orderBy(user.deletedAt);

  return rows.map((row) => row.id);
}

export interface OrganizationMemberUsers {
  ownerUserIds: string[];
  otherUserIds: string[];
}

export async function getOrganizationMemberUsers({
  organizationId,
}: {
  organizationId: string;
}): Promise<OrganizationMemberUsers> {
  const rows = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(eq(member.organizationId, organizationId));

  const isOwner = (role: string) => hasOrganizationRole(role, ORGANIZATION_OWNER_ROLE);
  return {
    ownerUserIds: rows.filter((row) => isOwner(row.role)).map((row) => row.userId),
    otherUserIds: rows.filter((row) => !isOwner(row.role)).map((row) => row.userId),
  };
}

export async function deleteUsersByIds({ userIds }: { userIds: string[] }): Promise<void> {
  if (userIds.length === 0) return;
  await db.delete(user).where(inArray(user.id, userIds));
}

export async function deleteOrganizationById({
  organizationId,
}: {
  organizationId: string;
}): Promise<void> {
  await db.delete(organization).where(eq(organization.id, organizationId));
}
