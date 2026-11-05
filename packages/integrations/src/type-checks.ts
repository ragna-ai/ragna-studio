import type {
  CloudDriveIntegrationId as DbCloudDriveIntegrationId,
  IntegrationId as DbIntegrationId,
} from '@repo/database/schema';
import type { CloudDriveIntegrationId, IntegrationId, IntegrationTools } from './catalog';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// @repo/database cannot import the catalog, so its id literals are checked here.
export const INTEGRATION_ID_MATCHES_DATABASE: Equal<IntegrationId, DbIntegrationId> = true;
export const CLOUD_DRIVE_ID_MATCHES_DATABASE: Equal<
  CloudDriveIntegrationId,
  DbCloudDriveIntegrationId
> = true;

export const INTEGRATION_TOOLS_COVER_CLOUD_DRIVES: Equal<
  keyof IntegrationTools,
  CloudDriveIntegrationId
> = true;
