import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

interface UpdateUserProfileBody {
  name: string;
}

export default function useUserApi() {
  const api = useApi();
  const queryClient = useQueryClient();

  function updateUserProfile() {
    return useMutation<unknown, unknown, UpdateUserProfileBody>({
      mutationFn: (body) => api('/user/profile', { method: 'PATCH', body }),
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
