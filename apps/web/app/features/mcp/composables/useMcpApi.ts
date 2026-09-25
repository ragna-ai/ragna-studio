import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  CreateMcpConnectionRequest,
  McpConnectionResponse,
  McpConnectionsResponse,
  McpSettingsResponse,
  UpdateMcpSettingsRequest,
} from '~/features/mcp/types';
import { extractErrorMessage } from '~/lib/api-error';

export const mcpKeys = {
  settings: ['mcp', 'settings'] as const,
  connections: ['mcp', 'connections'] as const,
};

interface FetchErrorWithStatus {
  status?: number;
}

/** True when `/mcp-settings` answered 404, i.e. MCP is disabled server-side (config.mcpEnabled = false). */
export function isMcpDisabledError(error: unknown): boolean {
  return (error as FetchErrorWithStatus | undefined)?.status === 404;
}

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetMcpSettings(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  return useQuery<McpSettingsResponse>({
    queryKey: mcpKeys.settings,
    queryFn: ({ signal }) =>
      $api<McpSettingsResponse>('/mcp-settings', { method: 'GET', signal }),
    retry: false,
    ...options,
  });
}

export function useUpdateMcpSettings() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<McpSettingsResponse, unknown, UpdateMcpSettingsRequest>({
    mutationFn: (body) =>
      $api<McpSettingsResponse>('/mcp-settings', { method: 'PUT', body }),
    onSuccess: (response) => {
      queryClient.setQueryData(mcpKeys.settings, response);
      queryClient.invalidateQueries({ queryKey: mcpKeys.connections });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to save MCP settings'));
    },
  });
}

export function useGetMcpConnections(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  return useQuery<McpConnectionsResponse>({
    queryKey: mcpKeys.connections,
    queryFn: ({ signal }) =>
      $api<McpConnectionsResponse>('/mcp-settings/connections', {
        method: 'GET',
        signal,
      }),
    retry: false,
    ...options,
  });
}

export function useCreateMcpConnection() {
  const { $api } = useNuxtApp();
  return useMutation<
    McpConnectionResponse,
    unknown,
    CreateMcpConnectionRequest
  >({
    mutationFn: (body) =>
      $api<McpConnectionResponse>('/mcp-settings/connections', {
        method: 'POST',
        body,
      }),
  });
}

export function useRevokeMcpConnection() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (connectionId) =>
      $api<void>(`/mcp-settings/connections/${connectionId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.connections });
    },
    onError: () => {
      toast.error('Failed to revoke connection');
    },
  });
}
