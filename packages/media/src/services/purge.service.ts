// Hard deletes after the 30 day recovery window. R2 objects go before the rows that point at
// them, so a failed run keeps everything and the next run retries.
import {
  deleteOrganizationById,
  deleteUsersByIds,
  getAllWorkspacesByOrganizationId,
  getOrganizationMemberUsers,
  listOrganizationIdsDeletedBefore,
  listUserIdsDeletedBefore,
} from '@repo/database';
import { logger } from '@repo/logger';
import { deleteWorkspaceMediaObjects } from './media.service';

const RECOVERY_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgeExpiredDeletionsSummary {
  organizationsPurged: number;
  usersPurged: number;
  failures: number;
}

/**
 * Deletes an organization for good: R2 objects of every workspace, the non-owner users,
 * the organization row (cascading workspaces, members, invitations, credit account), then the owner.
 * Throws when R2 cleanup is incomplete, before any row is touched.
 */
export async function purgeOrganization({
  organizationId,
}: {
  organizationId: string;
}): Promise<void> {
  const workspaces = await getAllWorkspacesByOrganizationId({ organizationId });
  const memberUsers = await getOrganizationMemberUsers({ organizationId });

  for (const { id: workspaceId } of workspaces) {
    const objectsDeleted = await deleteWorkspaceMediaObjects({ workspaceId });
    if (!objectsDeleted) {
      throw new Error(`Could not delete all media objects of workspace ${workspaceId}`);
    }
  }

  await deleteUsersByIds({ userIds: memberUsers.otherUserIds });
  await deleteOrganizationById({ organizationId });
  await deleteUsersByIds({ userIds: memberUsers.ownerUserIds });
}

/**
 * Purges organizations and users soft-deleted more than 30 days ago.
 * Every item runs on its own: one failure is logged and counted, the rest continue.
 */
export async function purgeExpiredDeletions({
  now = new Date(),
}: { now?: Date } = {}): Promise<PurgeExpiredDeletionsSummary> {
  const cutoff = new Date(now.getTime() - RECOVERY_WINDOW_DAYS * DAY_MS);
  const summary: PurgeExpiredDeletionsSummary = {
    organizationsPurged: 0,
    usersPurged: 0,
    failures: 0,
  };

  for (const organizationId of await listOrganizationIdsDeletedBefore({ date: cutoff })) {
    try {
      await purgeOrganization({ organizationId });
      summary.organizationsPurged += 1;
    } catch (error) {
      logger.error(`Failed to purge organization ${organizationId}`, error);
      summary.failures += 1;
    }
  }

  for (const userId of await listUserIdsDeletedBefore({ date: cutoff })) {
    try {
      await deleteUsersByIds({ userIds: [userId] });
      summary.usersPurged += 1;
    } catch (error) {
      logger.error(`Failed to purge user ${userId}`, error);
      summary.failures += 1;
    }
  }

  return summary;
}
