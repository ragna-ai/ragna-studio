import { z } from 'zod';

export const purgeOrganizationJobSchema = z.object({
  organizationId: z.uuidv7(),
});

export type PurgeOrganizationJobData = z.infer<typeof purgeOrganizationJobSchema>;

export const PURGE_ORGANIZATION_JOB = 'purge-organization-job';
