import { useQuery } from '@tanstack/vue-query';
import type { MediaListResponse } from '~/features/email/types';

/**
 * [GET] /workspace/:workspaceId/media - lists the active workspace's media
 * library for the compose "attach from library" picker (media-team
 * addition, no pagination yet: workspace libraries are small). Not part of
 * `emailKeys` since it isn't email-account-scoped, it's workspace-scoped
 * like the rest of the media feature.
 */
export function useGetWorkspaceMedia(options: {
  enabled: MaybeRefOrGetter<boolean>;
}) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<MediaListResponse>({
    queryKey: ['media', workspaceId, 'list'],
    queryFn: ({ signal }) =>
      $api<MediaListResponse>(`/workspace/${toValue(workspaceId)}/media`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && toValue(options.enabled),
  });
}
