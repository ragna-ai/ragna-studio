import type { IntegrationConnection } from '@repo/database';
import {
  listIntegrationsForProvider,
  type IntegrationDefinition,
  type IntegrationId,
} from '../catalog';

// Providers report scopes as full URIs or short names, in any case.
function normalizeScope(scope: string): string {
  const lower = scope.toLowerCase();
  return lower.slice(lower.lastIndexOf('/') + 1);
}

export function hasScope(grantedScopes: string[], scope: string): boolean {
  const needle = normalizeScope(scope);
  return grantedScopes.some((granted) => normalizeScope(granted) === needle);
}

export function coversIntegration(
  grantedScopes: string[],
  integration: IntegrationDefinition,
): boolean {
  return integration.scopes.every((scope) => hasScope(grantedScopes, scope));
}

export function connectionServesIntegration(
  connection: Pick<IntegrationConnection, 'enabledIntegrations' | 'scopes'>,
  integration: IntegrationDefinition,
): boolean {
  return (
    connection.enabledIntegrations.includes(integration.id) &&
    coversIntegration(connection.scopes, integration)
  );
}

export function listServedIntegrationIds(
  connection: Pick<IntegrationConnection, 'provider' | 'enabledIntegrations' | 'scopes'>,
): IntegrationId[] {
  return listIntegrationsForProvider(connection.provider)
    .filter((integration) => connectionServesIntegration(connection, integration))
    .map((integration) => integration.id);
}

/** Scopes to request: the integration's own plus those the connection already holds. */
export function mergeScopes(requested: string[], alreadyGranted: string[]): string[] {
  return Array.from(new Set(requested.concat(alreadyGranted)));
}
