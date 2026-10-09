import { createPrimaryId } from '@repo/utils';
import { and, eq, exists, inArray, ne, not } from 'drizzle-orm';
import { db } from '../db';
import { member, organization, workspace, type Workspace } from '../schema';

export const ORGANIZATION_OWNER_ROLE = 'owner';

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
      .values({ ownerId: userId, organizationId, name: 'Personal' })
      .returning();

    if (!personalWorkspace) {
      throw new Error('Failed to create personal workspace');
    }

    return { organizationId, workspace: personalWorkspace };
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
        eq(member.role, ORGANIZATION_OWNER_ROLE),
        ne(member.userId, userId),
      ),
    );

  const ownedOrganizationIds = db
    .select({ id: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, ORGANIZATION_OWNER_ROLE)));

  await db
    .delete(organization)
    .where(and(inArray(organization.id, ownedOrganizationIds), not(exists(otherOwner))));
}
