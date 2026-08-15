import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import type {
  CreateEmailCategoryRequest,
  EmailCategoryListResponse,
  EmailCategoryResponse,
  UpdateEmailCategoryRequest,
} from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

/** [GET] /email/category */
export function useGetEmailCategories() {
  const { $api } = useNuxtApp();
  return useQuery<EmailCategoryListResponse>({
    queryKey: emailKeys.categories(),
    queryFn: ({ signal }) =>
      $api<EmailCategoryListResponse>('/email/category', { method: 'GET', signal }),
  });
}

export function useCreateEmailCategory() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailCategoryResponse, unknown, CreateEmailCategoryRequest>({
    mutationFn: (body) => $api<EmailCategoryResponse>('/email/category', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.categories() });
      toast.success('Category created');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to create category'));
    },
  });
}

interface UpdateEmailCategoryVariables extends UpdateEmailCategoryRequest {
  categoryId: string;
}

export function useUpdateEmailCategory() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailCategoryResponse, unknown, UpdateEmailCategoryVariables>({
    mutationFn: ({ categoryId, ...body }) =>
      $api<EmailCategoryResponse>(`/email/category/${categoryId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      // Categories drive thread badges/filters too, not just the settings
      // list, so a broad invalidation keeps both in sync.
      queryClient.invalidateQueries({ queryKey: emailKeys.categories() });
      queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['email', 'thread'] });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to update category'));
    },
  });
}

export function useDeleteEmailCategory() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (categoryId) => $api<void>(`/email/category/${categoryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.categories() });
      queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
      toast.success('Category deleted');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete category'));
    },
  });
}
