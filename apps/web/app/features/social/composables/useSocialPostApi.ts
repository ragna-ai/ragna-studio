import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

export const socialPostKeys = {
  all: ['social-posts'] as const,
  list: () => ['social-posts', 'list'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export type SocialPostStatus = 'draft' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  platform: string;
  content: string;
  status: SocialPostStatus;
  source: string;
  externalId: string | null;
  externalUrl: string | null;
  publishedAt: string | null;
  publishError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPostManyResponse {
  posts: SocialPost[];
}

export interface SocialPostResponse {
  post: SocialPost;
}

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: { error?: string; errorCode?: string } };

// Returned by POST /social-posts/:id/publish when the user has no LinkedIn
// account linked, so the UI can show a "connect LinkedIn" hint instead of a
// generic error toast.
export const LINKEDIN_NOT_CONNECTED_ERROR_CODE = 'LINKEDIN_NOT_CONNECTED';

export function isLinkedInNotConnectedError(error: unknown): boolean {
  return (error as FetchErrorWithData | undefined)?.data?.errorCode === LINKEDIN_NOT_CONNECTED_ERROR_CODE;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as FetchErrorWithData | undefined)?.data?.error || fallback;
}

export function useGetSocialPosts(options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<SocialPostManyResponse>({
    queryKey: socialPostKeys.list(),
    queryFn: ({ signal }) => api('/social-posts', { method: 'GET', signal }),
    ...options,
  });
}

export function useUpdateSocialPost() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<SocialPostResponse, unknown, { id: string; content: string }>({
    mutationFn: ({ id, content }) =>
      api(`/social-posts/${id}`, { method: 'PATCH', body: { content } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all });
      toast.success(t('social.toast.updateSuccess'));
    },
    onError: (error) => toast.error(getErrorMessage(error, t('social.toast.updateError'))),
  });
}

export function useDeleteSocialPost() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<void, unknown, string>({
    mutationFn: (id) => api(`/social-posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all });
      toast.success(t('social.toast.deleteSuccess'));
    },
    onError: (error) => toast.error(getErrorMessage(error, t('social.toast.deleteError'))),
  });
}

export function usePublishSocialPost() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<SocialPostResponse, unknown, string>({
    mutationFn: (id) => api(`/social-posts/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all });
      toast.success(t('social.toast.publishSuccess'));
    },
    onError: (error) => {
      // Invalidate too: a failed publish still updates the post's status
      // and publishError server-side.
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all });

      if (isLinkedInNotConnectedError(error)) {
        toast.error(t('social.toast.linkedinNotConnected'));
        return;
      }
      toast.error(getErrorMessage(error, t('social.toast.publishError')));
    },
  });
}
