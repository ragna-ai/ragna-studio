import type { AuthSession } from '@repo/auth/client';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from '~/lib/toast';

type ApiClient = ReturnType<typeof useNuxtApp>['$api'];

export type AppLocale = 'en' | 'de';

interface UpdateUserProfileBody {
  name: string;
}

interface UpdateUserProfileResponse {
  user: AuthSession['user'];
}

/** Plain request, so route middleware can call it outside a component. */
export function patchUserLocale(
  $api: ApiClient,
  locale: AppLocale,
): Promise<UpdateUserProfileResponse> {
  return $api<UpdateUserProfileResponse>('/user/profile', {
    method: 'PATCH',
    body: { locale },
  });
}

export function useUpdateUserProfile() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  return useMutation<UpdateUserProfileResponse, unknown, UpdateUserProfileBody>(
    {
      mutationFn: (body) =>
        $api<UpdateUserProfileResponse>('/user/profile', {
          method: 'PATCH',
          body,
        }),
      onSuccess: async () => {
        // Invalidate the user query to refetch the updated user data
        queryClient.invalidateQueries({ queryKey: ['user'] });
        await refreshAuthSession();
        toast.success(t('user.toast.profileUpdated'));
      },
      onError: () => {
        toast.error(t('user.toast.profileUpdateFailed'));
      },
    },
  );
}

export function useUpdateUserLocale() {
  const { $api } = useNuxtApp();

  return useMutation<UpdateUserProfileResponse, unknown, AppLocale>({
    mutationFn: (locale) => patchUserLocale($api, locale),
    onSuccess: refreshAuthSession,
  });
}
