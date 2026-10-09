import {
  getOwnedOrganization,
  getPersonalWorkspaceIdByUserId,
  markOrganizationDeleted,
} from '@repo/database';
import { logger } from '@repo/logger';
import { deleteWorkspaceMediaObjects } from '@repo/media';
import { PURGE_ORGANIZATION_JOB, purgeOrganizationJobSchema, queue } from '@repo/queue';
import { APIError } from 'better-auth/api';

/**
 * Best-effort: the personal workspace rows cascade with the user, so their R2 objects go first.
 * A failure is logged and never blocks the removal.
 */
async function deletePersonalWorkspaceObjects({ userId }: { userId: string }): Promise<void> {
  try {
    const workspaceId = await getPersonalWorkspaceIdByUserId({ userId });
    if (!workspaceId) return;

    const objectsDeleted = await deleteWorkspaceMediaObjects({ workspaceId });
    if (!objectsDeleted) {
      logger.error(`Incomplete R2 cleanup of personal workspace ${workspaceId}`);
    }
  } catch (error) {
    logger.error(`Failed to clean up the personal workspace of user ${userId}`, error);
  }
}

/**
 * `user.delete.before` for the platform admin's remove-user. An owner with other active
 * members is blocked. A sole owner's organization is marked deleted and purged by a worker job,
 * since better-auth deletes only the user row.
 */
export async function prepareUserRemoval({ userId }: { userId: string }): Promise<void> {
  const owned = await getOwnedOrganization({ userId });
  if (!owned) {
    await deletePersonalWorkspaceObjects({ userId });
    return;
  }

  if (owned.hasOtherActiveMembers) {
    throw new APIError('BAD_REQUEST', {
      message: 'Transfer ownership or delete the organization first.',
    });
  }

  await markOrganizationDeleted({ organizationId: owned.organizationId });
  await queue
    .purge()
    .add(
      PURGE_ORGANIZATION_JOB,
      purgeOrganizationJobSchema.parse({ organizationId: owned.organizationId }),
      { attempts: 3 },
    );
}
