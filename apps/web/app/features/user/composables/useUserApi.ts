import type { AuthSession } from '@repo/auth/client';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

interface UpdateUserProfileBody {
  name: string;
}

interface UpdateUserProfileResponse {
  user: AuthSession['user'];
}

export default function useUserApi() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  function updateUserProfile() {
    return useMutation<
      UpdateUserProfileResponse,
      unknown,
      UpdateUserProfileBody
    >({
      mutationFn: (body) =>
        $api<UpdateUserProfileResponse>('/user/profile', {
          method: 'PATCH',
          body,
        }),
      onSuccess: async () => {
        // Invalidate the user query to refetch the updated user data
        queryClient.invalidateQueries({ queryKey: ['user'] });
        await refreshAuthSession();
        toast.success('Profile updated');
      },
      onError: () => {
        toast.error('Failed to update profile');
      },
    });
  }

  return {
    updateUserProfile,
  };
}
