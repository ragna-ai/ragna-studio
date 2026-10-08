import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import type {
  EmailAutoDraftSenderListResponse,
  EmailAutoDraftSenderResponse,
} from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

/** [GET] /email/auto-draft-sender */
export function useGetAutoDraftSenders() {
  const { $api } = useNuxtApp();
  return useQuery<EmailAutoDraftSenderListResponse>({
    queryKey: emailKeys.autoDraftSenders(),
    queryFn: ({ signal }) =>
      $api<EmailAutoDraftSenderListResponse>('/email/auto-draft-sender', {
        method: 'GET',
        signal,
      }),
  });
}

export function useAddAutoDraftSender() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailAutoDraftSenderResponse, unknown, string>({
    mutationFn: (senderEmail) =>
      $api<EmailAutoDraftSenderResponse>('/email/auto-draft-sender', {
        method: 'POST',
        body: { senderEmail },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.autoDraftSenders() });
      toast.success('Sender added');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to add sender'));
    },
  });
}

export function useRemoveAutoDraftSender() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (senderId) =>
      $api<void>(`/email/auto-draft-sender/${senderId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.autoDraftSenders() });
      toast.success('Sender removed');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to remove sender'));
    },
  });
}
