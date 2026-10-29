import type {
  IntegrationConnectionDto,
  IntegrationId,
  ProviderId,
} from '@repo/integrations/catalog';

export const CONNECTIONS_PAGE_PATH = '/settings/connections';

export const INTEGRATION_ERROR_QUERY_PARAM = 'integration_error';

export const PROVIDER_ICON: Record<ProviderId, string> = {
  google: 'logos:google-icon',
  microsoft: 'logos:microsoft-icon',
  linkedin: 'logos:linkedin-icon',
};

const FIRST_INTEGRATION_OF_PROVIDER: Record<ProviderId, IntegrationId> = {
  google: 'gmail',
  microsoft: 'outlook-mail',
  linkedin: 'linkedin-posting',
};

const MAIL_INTEGRATIONS: ReadonlySet<IntegrationId> = new Set([
  'gmail',
  'outlook-mail',
]);

/** The integration to authorize again when a connection needs a new grant. */
export function reconnectIntegrationId(
  connection: IntegrationConnectionDto,
): IntegrationId {
  return (
    connection.integrations[0] ??
    FIRST_INTEGRATION_OF_PROVIDER[connection.provider]
  );
}

export function connectionUsesMailbox(
  connection: IntegrationConnectionDto,
): boolean {
  return connection.integrations.some((id) => MAIL_INTEGRATIONS.has(id));
}
