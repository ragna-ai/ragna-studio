import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import { buildSendFormData } from '~/features/email/lib/email-send-form-data';
import type { SendEmailResponse, SendEmailVariables } from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

/**
 * [POST] /email/send - multipart, handles both new mail and replies
 * (docs/email/prd.md: `threadId`+`replyToMessageId` present = reply). The
 * sent message is never hand-inserted into the local index (email.service.ts
 * comment); it lands in the thread on the next sync poll, so this only
 * invalidates the thread detail/list caches rather than patching them.
 */
export function useSendEmail() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<SendEmailResponse, unknown, SendEmailVariables>({
    mutationFn: (input) => $api<SendEmailResponse>('/email/send', { method: 'POST', body: buildSendFormData(input) }),
    onSuccess: (result, variables) => {
      if (variables.threadId) {
        queryClient.invalidateQueries({ queryKey: emailKeys.thread(variables.threadId) });
      }
      queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
      if (variables.draftId) {
        queryClient.invalidateQueries({ queryKey: emailKeys.drafts(result.threadId) });
        queryClient.invalidateQueries({ queryKey: emailKeys.pendingDrafts() });
      }
      toast.success('Email sent');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to send email'));
    },
  });
}
