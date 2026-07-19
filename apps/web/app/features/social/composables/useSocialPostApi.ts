import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

type WorkspaceId = MaybeRefOrGetter<string>;

function postsBasePath(workspaceId: WorkspaceId): string {
  return `/workspace/${toValue(workspaceId)}/social-post`;
}

export const socialPostKeys = {
  all: (workspaceId: WorkspaceId) => ['social-posts', workspaceId] as const,
  list: (
    workspaceId: WorkspaceId,
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
  ) => ['social-posts', workspaceId, 'list', page, limit] as const,
  detail: (workspaceId: WorkspaceId, postId: MaybeRefOrGetter<string>) =>
    ['social-posts', workspaceId, 'detail', postId] as const,
  mediaUpload: () => ['social-posts', 'media', 'upload'] as const,
};

export type SocialPostStatus = 'draft' | 'published' | 'failed';

// Client-side mirror of the API's limits (apps/api/src/services/social-post.service.ts),
// so invalid attachments are rejected before a request is even sent.
export const SOCIAL_POST_MAX_MEDIA = 9;
export const SOCIAL_POST_MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB
export const SOCIAL_POST_ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
] as const;

export interface SocialPostMedia {
  id: string;
  storageKey: string;
  mimeType: string;
  altText: string | null;
  sortOrder: number;
  imageUrl: string;
}

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
  media: SocialPostMedia[];
}

export interface SocialPostManyResponse {
  posts: SocialPost[];
  meta: {
    totalCount: number;
  };
}

export interface SocialPostResponse {
  post: SocialPost;
}

export interface SocialPostMediaResponse {
  media: SocialPostMedia;
}

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: { error?: string; errorCode?: string } };

// Returned by POST .../social-post/:socialPostId/publish when the user has
// no LinkedIn account linked, so the UI can show a "connect LinkedIn" hint
// instead of a generic error toast.
export const LINKEDIN_NOT_CONNECTED_ERROR_CODE = 'LINKEDIN_NOT_CONNECTED';

export function isLinkedInNotConnectedError(error: unknown): boolean {
  return (
    (error as FetchErrorWithData | undefined)?.data?.errorCode ===
    LINKEDIN_NOT_CONNECTED_ERROR_CODE
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as FetchErrorWithData | undefined)?.data?.error || fallback;
}

/**
 * A single post, fetched from its own detail endpoint. Its query key sits
 * under the same `social-posts` root as the list query (see
 * `socialPostKeys`), so mutations that invalidate `socialPostKeys.all`
 * refresh both together.
 */
export function useGetSocialPost(postId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const { data, isLoading, isError } = useQuery<SocialPostResponse>({
    queryKey: socialPostKeys.detail(workspaceId, postId),
    queryFn: ({ signal }) =>
      api(`${postsBasePath(workspaceId)}/${toValue(postId)}`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(postId),
  });

  const post = computed(() => data.value?.post ?? null);

  return { post, isLoading, isError };
}

export function useCreateSocialPost() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<SocialPostResponse, unknown, string>({
    mutationFn: (content) =>
      api(postsBasePath(workspaceId), {
        method: 'POST',
        body: { content },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, t('social.toast.createError'))),
  });
}

export function useUpdateSocialPost() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<
    SocialPostResponse,
    unknown,
    { id: string; content: string }
  >({
    mutationFn: ({ id, content }) =>
      api(`${postsBasePath(workspaceId)}/${id}`, {
        method: 'PATCH',
        body: { content },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });
      toast.success(t('social.toast.updateSuccess'));
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, t('social.toast.updateError'))),
  });
}

export function useDeleteSocialPost() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<void, unknown, string>({
    mutationFn: (id) =>
      api(`${postsBasePath(workspaceId)}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });
      toast.success(t('social.toast.deleteSuccess'));
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, t('social.toast.deleteError'))),
  });
}

export function usePublishSocialPost() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<SocialPostResponse, unknown, string>({
    mutationFn: (id) =>
      api(`${postsBasePath(workspaceId)}/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });
      toast.success(t('social.toast.publishSuccess'));
    },
    onError: (error) => {
      // Invalidate too: a failed publish still updates the post's status
      // and publishError server-side.
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });

      if (isLinkedInNotConnectedError(error)) {
        toast.error(t('social.toast.linkedinNotConnected'));
        return;
      }
      toast.error(getErrorMessage(error, t('social.toast.publishError')));
    },
  });
}

export interface UploadSocialPostMediaVariables {
  postId: string;
  file: File;
}

export function useUploadSocialPostMedia() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<
    SocialPostMediaResponse,
    unknown,
    UploadSocialPostMediaVariables
  >({
    mutationKey: socialPostKeys.mediaUpload(),
    mutationFn: ({ postId, file }) => {
      const formData = new FormData();
      formData.append('file', file);
      return api(`${postsBasePath(workspaceId)}/${postId}/media`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, t('social.toast.mediaUploadError'))),
  });
}

/**
 * Files currently uploading for a given post. Reads the shared mutation
 * cache (like usePendingGenImageCount does for image generation) instead of
 * local state, so it stays correct even if several files are attached at
 * once from `SocialPostMediaList.vue`.
 */
export function usePendingSocialPostMediaUploads(postId: string) {
  const pending = useMutationState({
    filters: { mutationKey: socialPostKeys.mediaUpload(), status: 'pending' },
    select: (mutation) =>
      mutation.state.variables as UploadSocialPostMediaVariables | undefined,
  });

  return computed(() =>
    pending.value.filter((variables) => variables?.postId === postId),
  );
}

export function useUpdateSocialPostMediaAltText() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<
    SocialPostMediaResponse,
    unknown,
    { postId: string; mediaId: string; altText: string }
  >({
    mutationFn: ({ postId, mediaId, altText }) =>
      api(`${postsBasePath(workspaceId)}/${postId}/media/${mediaId}`, {
        method: 'PATCH',
        body: { altText },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, t('social.toast.mediaAltTextError'))),
  });
}

export function useDeleteSocialPostMedia() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation<void, unknown, { postId: string; mediaId: string }>({
    mutationFn: ({ postId, mediaId }) =>
      api(`${postsBasePath(workspaceId)}/${postId}/media/${mediaId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialPostKeys.all(workspaceId) });
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, t('social.toast.mediaDeleteError'))),
  });
}
