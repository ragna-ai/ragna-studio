import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetAllAiModels(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  return useQuery({
    queryKey: ['aimodels'],
    queryFn: ({ signal }) =>
      $api('/aimodel', {
        method: 'GET',
        signal,
      }),
    placeholderData: (prev: any) => prev, // keep previous results while refetching
    ...options,
  });
}
