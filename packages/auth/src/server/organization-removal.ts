import { getOwnedOrganization, markOrganizationDeleted } from '@repo/database';
import { PURGE_ORGANIZATION_JOB, purgeOrganizationJobSchema, queue } from '@repo/queue';
import { APIError } from 'better-auth/api';

/**
 * `user.delete.before` for the platform admin's remove-user. An owner with other active
 * members is blocked. A sole owner's organization is marked deleted and purged by a worker job,
 * since better-auth deletes only the user row.
 */
export async function prepareUserRemoval({ userId }: { userId: string }): Promise<void> {
  const owned = await getOwnedOrganization({ userId });
  if (!owned) return;

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
