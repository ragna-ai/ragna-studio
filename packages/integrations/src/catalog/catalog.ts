import type {
  IntegrationCategory,
  IntegrationDefinition,
  IntegrationId,
  ProviderId,
} from './catalog.types';

const CATALOG_ENTRIES = [
  {
    id: 'gmail',
    provider: 'google',
    category: 'mail',
    authType: 'oauth2',
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  },
  {
    id: 'outlook-mail',
    provider: 'microsoft',
    category: 'mail',
    authType: 'oauth2',
    scopes: ['Mail.ReadWrite', 'Mail.Send'],
  },
  {
    id: 'linkedin-posting',
    provider: 'linkedin',
    category: 'social',
    authType: 'oauth2',
    scopes: ['w_member_social'],
  },
] satisfies IntegrationDefinition[];

export const INTEGRATION_CATALOG: readonly IntegrationDefinition[] = CATALOG_ENTRIES;

/**
 * The integration ids of one category, read from the catalog. A capability registry typed as
 * `Record<IntegrationIdIn<'mail'>, ...>` fails type-checking until every entry has an implementation.
 */
export type IntegrationIdIn<C extends IntegrationCategory> = Extract<
  (typeof CATALOG_ENTRIES)[number],
  { category: C }
>['id'];

export function findIntegration(id: string): IntegrationDefinition | null {
  return INTEGRATION_CATALOG.find((integration) => integration.id === id) ?? null;
}

export function getIntegration(id: IntegrationId): IntegrationDefinition {
  const integration = findIntegration(id);
  if (!integration) {
    throw new Error(`Unknown integration ${id}`);
  }
  return integration;
}

export function listIntegrationsForProvider(provider: ProviderId): IntegrationDefinition[] {
  return INTEGRATION_CATALOG.filter((integration) => integration.provider === provider);
}
