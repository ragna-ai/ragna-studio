import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  ConnectIntegrationBody,
  ConnectIntegrationResponse,
  IntegrationCatalogResponse,
  IntegrationConnectionsResponse,
} from '@repo/integrations/catalog';
import { extractErrorMessage } from '~/lib/api-error';

export const integrationKeys = {
  catalog: ['integration', 'catalog'] as const,
  connections: ['integration', 'connections'] as const,
};

export function useGetIntegrationCatalog() {
  const { $api } = useNuxtApp();
  return useQuery<IntegrationCatalogResponse>({
    queryKey: integrationKeys.catalog,
    queryFn: ({ signal }) =>
      $api<IntegrationCatalogResponse>('/integration/catalog', {
        method: 'GET',
        signal,
      }),
  });
}

export function useGetIntegrationConnections() {
  const { $api } = useNuxtApp();
  return useQuery<IntegrationConnectionsResponse>({
    queryKey: integrationKeys.connections,
    queryFn: ({ signal }) =>
      $api<IntegrationConnectionsResponse>('/integration/connection', {
        method: 'GET',
        signal,
      }),
  });
}

export function useStartIntegrationConnect() {
  const { $api, $i18n } = useNuxtApp();
  return useMutation<
    ConnectIntegrationResponse,
    unknown,
    ConnectIntegrationBody
  >({
    mutationFn: (body) =>
      $api<ConnectIntegrationResponse>('/integration/connect', {
        method: 'POST',
        body,
      }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, $i18n.t('integrations.toast.connectFailed')),
      );
    },
  });
}

export function useRemoveIntegrationConnection() {
  const { $api, $i18n } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, string>({
    mutationFn: (connectionId) =>
      $api(`/integration/connection/${connectionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      // The mailbox goes with its connection.
      queryClient.invalidateQueries({ queryKey: integrationKeys.connections });
      queryClient.invalidateQueries({ queryKey: ['email'] });
      toast.success($i18n.t('integrations.toast.removed'));
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, $i18n.t('integrations.toast.removeFailed')),
      );
    },
  });
}
