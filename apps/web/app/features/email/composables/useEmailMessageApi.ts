import type { MailAttachmentMeta } from '@repo/mail/provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import { deriveThreadSummaryPatch, patchThreadDetail, patchThreadInLists } from '~/features/email/lib/email-thread-cache';
import type { EmailMessageActionResponse } from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';
import { downloadBlob, filenameFromContentDisposition } from '~/lib/file-export';

/** [GET] /email/message/:messageId/attachments response. */
interface EmailMessageAttachmentsResponse {
  attachments: MailAttachmentMeta[];
}

/**
 * A message action only returns the one updated row, so the thread-list
 * patch is derived from the *merged* message list (patchThreadDetail's
 * return value: every other message in the thread plus this update), not
 * just the single message - a thread with 3 messages where only 1 is
 * starred must still show as starred after unstarring a different one.
 * Falls back to a single-field patch only if the detail cache wasn't
 * loaded (shouldn't happen in practice: message actions only fire from
 * EmailMessageItem, which requires the thread detail to already be loaded).
 */
function applyMessageActionSuccess(
  queryClient: ReturnType<typeof useQueryClient>,
  threadId: string,
  message: EmailMessageActionResponse['message'],
): void {
  const mergedMessages = patchThreadDetail(queryClient, threadId, [message]);
  if (mergedMessages) {
    patchThreadInLists(queryClient, threadId, deriveThreadSummaryPatch(mergedMessages));
  } else {
    patchThreadInLists(queryClient, threadId, { isUnread: message.isUnread, isStarred: message.isStarred });
  }
}

interface MessageActionVariables {
  threadId: string;
  messageId: string;
}

/** [POST] /email/message/:messageId/archive */
export function useSetMessageArchived() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailMessageActionResponse, unknown, MessageActionVariables & { archived: boolean }>({
    mutationFn: ({ messageId, archived }) =>
      $api<EmailMessageActionResponse>(`/email/message/${messageId}/archive`, { method: 'POST', body: { archived } }),
    onSuccess: ({ message }, { threadId }) => applyMessageActionSuccess(queryClient, threadId, message),
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to archive message')),
  });
}

/** [POST] /email/message/:messageId/trash */
export function useSetMessageTrashed() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailMessageActionResponse, unknown, MessageActionVariables>({
    mutationFn: ({ messageId }) =>
      $api<EmailMessageActionResponse>(`/email/message/${messageId}/trash`, { method: 'POST' }),
    onSuccess: ({ message }, { threadId }) => applyMessageActionSuccess(queryClient, threadId, message),
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to move message to trash')),
  });
}

/** [POST] /email/message/:messageId/star */
export function useSetMessageStarred() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailMessageActionResponse, unknown, MessageActionVariables & { starred: boolean }>({
    mutationFn: ({ messageId, starred }) =>
      $api<EmailMessageActionResponse>(`/email/message/${messageId}/star`, { method: 'POST', body: { starred } }),
    onSuccess: ({ message }, { threadId }) => applyMessageActionSuccess(queryClient, threadId, message),
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to update star')),
  });
}

/** [POST] /email/message/:messageId/read */
export function useSetMessageRead() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailMessageActionResponse, unknown, MessageActionVariables & { read: boolean }>({
    mutationFn: ({ messageId, read }) =>
      $api<EmailMessageActionResponse>(`/email/message/${messageId}/read`, { method: 'POST', body: { read } }),
    onSuccess: ({ message }, { threadId }) => applyMessageActionSuccess(queryClient, threadId, message),
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to update read status')),
  });
}

// Attachment metadata is resolved live, never persisted
// (docs/email/prd.md, "Attachments stay fetch-on-demand"), so this is a
// plain lazy query, only enabled once a message is expanded
// (see EmailMessageAttachments.vue).

/** [GET] /email/message/:messageId/attachments - lazy, only fetched once a message is expanded. */
export function useGetEmailMessageAttachments(
  messageId: MaybeRefOrGetter<string>,
  options: { enabled: MaybeRefOrGetter<boolean> },
) {
  const { $api } = useNuxtApp();
  return useQuery<EmailMessageAttachmentsResponse>({
    queryKey: emailKeys.attachments(messageId),
    queryFn: ({ signal }) =>
      $api<EmailMessageAttachmentsResponse>(`/email/message/${toValue(messageId)}/attachments`, {
        method: 'GET',
        signal,
      }),
    enabled: options.enabled,
  });
}

/**
 * [GET] /email/message/:messageId/attachment/:attachmentId - fetched as a
 * blob through the authenticated `$api` instance (document export
 * pattern, useDocumentApi.ts's useExportDocument) rather than a plain
 * anchor href, so the download carries the session cookie reliably
 * cross-origin between the web and API dev ports.
 */
export function useDownloadEmailAttachment() {
  const { $api } = useNuxtApp();
  return useMutation<void, unknown, { messageId: string; attachment: MailAttachmentMeta }>({
    mutationFn: async ({ messageId, attachment }) => {
      const response = await $api.raw<Blob>(
        `/email/message/${messageId}/attachment/${attachment.id}`,
        { method: 'GET', responseType: 'blob' },
      );
      if (!response._data) {
        throw new Error('Empty attachment response');
      }
      const filename =
        filenameFromContentDisposition(response.headers.get('content-disposition')) ?? attachment.filename;
      downloadBlob(response._data, filename);
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to download attachment'));
    },
  });
}
