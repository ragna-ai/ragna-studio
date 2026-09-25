import { useQuery } from '@tanstack/vue-query';

// GET /auth/oauth2/public-client (@better-auth/oauth-provider); only the fields the consent page uses are typed.
export interface OAuthClientPublicInfo {
  client_id: string;
  client_name?: string;
}

/** Public display info for the client on the OAuth consent page; session-authenticated, 404 if the client id is unknown. */
export function useGetOAuthClientPublic(
  clientId: MaybeRefOrGetter<string | null>,
) {
  const { $api } = useNuxtApp();
  return useQuery<OAuthClientPublicInfo>({
    queryKey: ['mcp', 'oauth-client', clientId],
    queryFn: ({ signal }) =>
      $api<OAuthClientPublicInfo>('/auth/oauth2/public-client', {
        method: 'GET',
        query: { client_id: toValue(clientId) },
        signal,
      }),
    enabled: () => !!toValue(clientId),
    retry: false,
  });
}
