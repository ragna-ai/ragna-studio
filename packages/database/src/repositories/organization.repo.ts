import { createPrimaryId } from '@repo/utils';
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
