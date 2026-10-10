import {
  getMediaByWorkspaceId,
  getOwnedOrganization,
  getPersonalWorkspaceIdByUserId,
  markOrganizationDeleted,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  DELETE_MEDIA_OBJECTS_BATCH_SIZE,
  DELETE_MEDIA_OBJECTS_JOB,
  deleteMediaObjectsJobSchema,
  PURGE_ORGANIZATION_JOB,
  purgeOrganizationJobSchema,
  queue,
} from '@repo/queue';
import { APIError } from 'better-auth/api';

interface MediaObjectRef {
  bucket: string;
  key: string;
}

async function listPersonalWorkspaceObjects({
  userId,
}: {
  userId: string;
}): Promise<MediaObjectRef[]> {
  const workspaceId = await getPersonalWorkspaceIdByUserId({ userId });
  if (!workspaceId) return [];

  const mediaRows = await getMediaByWorkspaceId({ workspaceId });
  return mediaRows.map((row) => ({ bucket: row.bucket, key: row.storageKey }));
}

/**
 * Splits objects into job-sized chunks. s3mini already batches R2 requests by 1000,
 * so the cap only bounds the job payload size.
 */
function chunkObjects(objects: MediaObjectRef[]): MediaObjectRef[][] {
  const chunks: MediaObjectRef[][] = [];
  for (let start = 0; start < objects.length; start += DELETE_MEDIA_OBJECTS_BATCH_SIZE) {
    chunks.push(objects.slice(start, start + DELETE_MEDIA_OBJECTS_BATCH_SIZE));
  }
  return chunks;
}

/**
 * Best-effort: the personal workspace rows cascade with the user, so their R2 objects are handed
 * to worker jobs first, enqueued together in one atomic call. A failure is logged and never
 * blocks the removal.
 */
async function enqueuePersonalWorkspaceCleanup({ userId }: { userId: string }): Promise<void> {
  try {
    const objects = await listPersonalWorkspaceObjects({ userId });
    if (objects.length === 0) return;

    const jobs = chunkObjects(objects).map((chunk) => ({
      name: DELETE_MEDIA_OBJECTS_JOB,
      data: deleteMediaObjectsJobSchema.parse({ objects: chunk }),
      opts: { attempts: 3 },
    }));
    await queue.purge().addBulk(jobs);
  } catch (error) {
    logger.error(`Failed to enqueue the personal workspace cleanup of user ${userId}`, error);
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
    await enqueuePersonalWorkspaceCleanup({ userId });
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
