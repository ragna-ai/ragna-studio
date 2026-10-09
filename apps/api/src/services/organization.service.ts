import {
  getMembershipByUserId,
  getOrganizationMember,
  hasOrganizationRole,
  listCreditUsageByUser,
  MEMBER_REMOVED_BAN_REASON,
  ORGANIZATION_ADMIN_ROLE,
  ORGANIZATION_OWNER_ROLE,
  restoreMemberAccount,
  restoreOrganization,
  softDeleteMemberAccount,
  softDeleteOrganization,
  transferOrganizationOwnership,
  type OrganizationMemberRecord,
  type UserMembership,
} from '@repo/database';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  OrganizationDeletedException,
} from '../exceptions';

const MICRO_CREDITS_PER_CREDIT = 1_000_000;

export interface OrganizationResponse {
  id: string;
  name: string;
  role: string;
  deletedAt: string | null;
}

export interface MemberUsageResponse {
  userId: string | null;
  name: string | null;
  eventCount: number;
  credits: number;
}

export interface OrganizationUsageResponse {
  members: MemberUsageResponse[];
}

function isOwner(membership: UserMembership): boolean {
  return hasOrganizationRole(membership.role, ORGANIZATION_OWNER_ROLE);
}

function isOwnerOrAdmin(membership: UserMembership): boolean {
  return isOwner(membership) || hasOrganizationRole(membership.role, ORGANIZATION_ADMIN_ROLE);
}

async function requireMembership({ userId }: { userId: string }): Promise<UserMembership> {
  const membership = await getMembershipByUserId({ userId });
  if (!membership) throw new NotFoundException('Organization not found');
  return membership;
}

/** Every organization action except reading it and restoring it needs an active organization. */
async function requireActiveMembership({ userId }: { userId: string }): Promise<UserMembership> {
  const membership = await requireMembership({ userId });
  if (membership.organizationDeletedAt) throw new OrganizationDeletedException();
  return membership;
}

async function requireOwnerOrAdmin({ userId }: { userId: string }): Promise<UserMembership> {
  const membership = await requireActiveMembership({ userId });
  if (!isOwnerOrAdmin(membership)) throw new ForbiddenException();
  return membership;
}

/** The caller's organization id for `/workspace` and `/credit`; throws while it is soft-deleted. */
export async function requireActiveOrganizationId({ userId }: { userId: string }): Promise<string> {
  const membership = await requireActiveMembership({ userId });
  return membership.organizationId;
}

async function requireMemberOfOrganization({
  organizationId,
  memberId,
}: {
  organizationId: string;
  memberId: string;
}): Promise<OrganizationMemberRecord> {
  const target = await getOrganizationMember({ organizationId, memberId });
  if (!target) throw new NotFoundException('Member not found');
  return target;
}

export async function getOrganizationForUser({
  userId,
}: {
  userId: string;
}): Promise<OrganizationResponse> {
  const membership = await requireMembership({ userId });
  return {
    id: membership.organizationId,
    name: membership.organizationName,
    role: membership.role,
    deletedAt: membership.organizationDeletedAt?.toISOString() ?? null,
  };
}

export async function deleteOrganizationForUser({ userId }: { userId: string }): Promise<void> {
  const caller = await requireActiveMembership({ userId });
  if (!isOwner(caller)) throw new ForbiddenException();

  await softDeleteOrganization({ organizationId: caller.organizationId });
}

export async function restoreOrganizationForUser({ userId }: { userId: string }): Promise<void> {
  const caller = await requireMembership({ userId });
  if (!isOwner(caller)) throw new ForbiddenException();
  if (!caller.organizationDeletedAt) {
    throw new BadRequestException('This organization is not deleted.');
  }

  await restoreOrganization({ organizationId: caller.organizationId });
}

export async function removeMemberForUser({
  userId,
  memberId,
}: {
  userId: string;
  memberId: string;
}): Promise<void> {
  const caller = await requireOwnerOrAdmin({ userId });
  const target = await requireMemberOfOrganization({
    organizationId: caller.organizationId,
    memberId,
  });
  if (hasOrganizationRole(target.role, ORGANIZATION_OWNER_ROLE)) {
    throw new ForbiddenException('The owner cannot be removed.');
  }
  if (target.deletedAt) throw new BadRequestException('This member was already removed.');

  await softDeleteMemberAccount({ userId: target.userId });
}

export async function restoreMemberForUser({
  userId,
  memberId,
}: {
  userId: string;
  memberId: string;
}): Promise<void> {
  const caller = await requireOwnerOrAdmin({ userId });
  const target = await requireMemberOfOrganization({
    organizationId: caller.organizationId,
    memberId,
  });
  const wasRemoved = target.deletedAt !== null && target.banReason === MEMBER_REMOVED_BAN_REASON;
  if (!wasRemoved) throw new NotFoundException('Member not found');

  await restoreMemberAccount({ userId: target.userId });
}

export async function leaveOrganization({ userId }: { userId: string }): Promise<void> {
  const membership = await requireActiveMembership({ userId });
  if (isOwner(membership)) {
    throw new BadRequestException(
      'The owner cannot leave. Transfer ownership or delete the organization.',
    );
  }

  await softDeleteMemberAccount({ userId });
}

export async function transferOwnershipForUser({
  userId,
  memberId,
}: {
  userId: string;
  memberId: string;
}): Promise<void> {
  const caller = await requireActiveMembership({ userId });
  if (!isOwner(caller)) throw new ForbiddenException();

  const target = await requireMemberOfOrganization({
    organizationId: caller.organizationId,
    memberId,
  });
  if (target.memberId === caller.memberId) {
    throw new BadRequestException('You already own this organization.');
  }
  if (target.deletedAt) throw new BadRequestException('Removed members cannot become the owner.');

  await transferOrganizationOwnership({
    currentOwnerMemberId: caller.memberId,
    newOwnerMemberId: target.memberId,
  });
}

export async function getUsageByMemberForUser({
  userId,
}: {
  userId: string;
}): Promise<OrganizationUsageResponse> {
  const caller = await requireOwnerOrAdmin({ userId });
  const rows = await listCreditUsageByUser({ organizationId: caller.organizationId });

  return {
    members: rows.map((row) => ({
      userId: row.userId,
      name: row.userName,
      eventCount: row.eventCount,
      credits: Number(row.chargedMicroCredits) / MICRO_CREDITS_PER_CREDIT,
    })),
  };
}
