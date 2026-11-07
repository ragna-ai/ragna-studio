import type { IntegrationId as DbIntegrationId } from '@repo/database/schema';
import type { IntegrationId } from './catalog';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// @repo/database cannot import the catalog, so its id literals are checked here.
export const INTEGRATION_ID_MATCHES_DATABASE: Equal<IntegrationId, DbIntegrationId> = true;
