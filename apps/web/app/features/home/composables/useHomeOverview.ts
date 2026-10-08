import type { HomeOverviewResponse } from '~/features/home/types';

/**
 * Single aggregated fetch backing all four home overview cards:
 * one round trip, one loading state instead of
 * four separate card-level queries. Keyed by workspace id so switching
 * workspaces in the switcher refetches instead of showing stale data from
 * the previous one.
 */
export function useHomeOverview() {
  const workspaceId = useActiveWorkspaceId();

  return useApiFetch<HomeOverviewResponse>(
    () => `/workspace/${workspaceId.value}/overview`,
    {
      key: () => `home-overview-${workspaceId.value}`,
      watch: [workspaceId],
      // No workspace selected yet (store still hydrating): skip the request
      // instead of firing one against ".../workspace/undefined/overview".
      enabled: () => !!workspaceId.value,
    },
  );
}
