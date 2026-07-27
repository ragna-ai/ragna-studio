import {
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import type {
  CreditBalanceResponse,
  CreditUsageManyResponse,
} from '~/features/credit/types';

// Credits belong to the user's account, not a workspace (docs/credits/prd.md,
// "API"), so these routes are user-global and the query keys carry no
// workspaceId, unlike every other use<Resource>Api.ts in this app.
export const creditKeys = {
  balance: () => ['credits', 'balance'] as const,
  usage: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    sort: MaybeRefOrGetter<'asc' | 'desc'>,
  ) => ['credits', 'usage', page, limit, sort] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

/**
 * The user's credit balance, for the user menu (docs/credits/prd.md,
 * "Frontend": "fetched once per session, refetched after a chat turn ends").
 * `staleTime: Infinity` is what makes it "once per session": Vue Query never
 * refetches this on its own, only `useInvalidateCreditBalance()` does.
 */
export function useGetCreditBalance(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  return useQuery<CreditBalanceResponse>({
    queryKey: creditKeys.balance(),
    queryFn: ({ signal }) =>
      $api<CreditBalanceResponse>('/credit/balance', {
        method: 'GET',
        signal,
      }),
    staleTime: Infinity,
    ...options,
  });
}

/** Forces the next read of the balance to refetch, e.g. after a chat turn ends. */
export function useInvalidateCreditBalance() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: creditKeys.balance() });
}

/** Paginated history of what the user's account has spent credits on. */
export function useGetCreditUsage(
  page: MaybeRefOrGetter<number>,
  limit: MaybeRefOrGetter<number>,
  sort: MaybeRefOrGetter<'asc' | 'desc'> = 'desc',
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  return useQuery<CreditUsageManyResponse>({
    queryKey: creditKeys.usage(page, limit, sort),
    queryFn: ({ signal }) =>
      $api<CreditUsageManyResponse>('/credit/usage', {
        method: 'GET',
        query: {
          page: toValue(page),
          limit: toValue(limit),
          sort: toValue(sort),
        },
        signal,
      }),
    placeholderData: (prev: CreditUsageManyResponse | undefined) => prev, // keep previous results while refetching
    ...options,
  });
}
