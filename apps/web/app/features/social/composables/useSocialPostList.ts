import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';
import {
  socialPostKeys,
  type SocialPostManyResponse,
} from '~/features/social/composables/useSocialPostApi';

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useSocialPostList() {
  const { $api } = useNuxtApp();
  const activeWorkspaceId = useActiveWorkspaceId();

  // useState -> single shared instance keyed by name, so pagination is owned
  // once instead of per-caller.
  const page = useState('social-post-list:page', () => 1);
  const limit = useState('social-post-list:limit', () => 10);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function useGetAllSocialPosts(options: QueryOpts = {}) {
    return useQuery<SocialPostManyResponse>({
      queryKey: socialPostKeys.list(activeWorkspaceId, page, limit),
      queryFn: ({ signal }) =>
        $api<SocialPostManyResponse>(
          `/workspace/${activeWorkspaceId.value}/social-post`,
          {
            method: 'GET',
            query: {
              page: page.value,
              limit: limit.value,
            },
            signal,
          },
        ),
      enabled: () => !!activeWorkspaceId.value,
      placeholderData: (prev: SocialPostManyResponse | undefined) => prev,
      ...options,
    });
  }

  return {
    page,
    limit,
    setPage,
    useGetAllSocialPosts,
  };
}
