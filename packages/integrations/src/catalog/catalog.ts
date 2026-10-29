import type { IntegrationDefinition, IntegrationId, ProviderId } from './catalog.types';

export const INTEGRATION_CATALOG: readonly IntegrationDefinition[] = [
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
];

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
