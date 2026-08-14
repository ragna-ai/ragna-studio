import { useQuery } from '@tanstack/vue-query';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import type { EmailSearchResponse } from '~/features/email/types';

/** [GET] /email/search?q=... - proxies Gmail's `q=` search operators. */
export function useSearchEmail(query: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  return useQuery<EmailSearchResponse>({
    queryKey: emailKeys.search(query),
    queryFn: ({ signal }) =>
      $api<EmailSearchResponse>('/email/search', { method: 'GET', query: { q: toValue(query) }, signal }),
    enabled: () => toValue(query).trim().length > 0,
  });
}
