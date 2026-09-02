import { toast } from 'vue-sonner';
import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  isAcceptedChatAttachment,
  isImageFilename,
} from '~/features/chat/lib/attachment-mime';
import {
  type TaskAttachment,
  useDeleteTaskAttachment,
  useUploadTaskAttachments,
} from '~/features/task/composables/useTaskApi';
import { extractErrorMessage } from '~/lib/api-error';
import { createPrimaryId } from '~/lib/utils';

export type PendingTaskAttachmentStatus = 'uploading' | 'done' | 'error';

export interface PendingTaskAttachment {
  id: string;
  file: File;
  status: PendingTaskAttachmentStatus;
  /** Local preview while uploading; swapped for `attachment.url` on success. */
  previewUrl?: string;
  attachment?: TaskAttachment;
  errorMessage?: string;
}

/**
 * Owns the task detail page's attachment upload flow: client-side
 * validation, eager upload, and the pending chip's local state. Ported from
 * ~/features/chat/composables/useChatAttachments.ts; simpler because the
 * task already exists whenever its detail page is open, so uploads never
 * need a chat-style "ensureChat" lazy-creation step.
 *
 * A finished item stays in `items` (surfaced via `finishedAttachments`)
 * rather than being dropped once uploaded: `TaskAttachments.vue` uses that
 * to filter the freshly-invalidated `useGetTaskAttachments` list so the same
 * attachment never renders twice while that refetch is still in flight.
 */
export function useTaskAttachments(taskId: MaybeRefOrGetter<string>) {
  const { t } = useI18n();
  const { mutateAsync: uploadAttachments } = useUploadTaskAttachments();
  const { mutateAsync: deleteAttachment } = useDeleteTaskAttachment();

  const items = ref<PendingTaskAttachment[]>([]);

  // Ids removed by the user while their upload was still in flight. The
  // in-flight fetch can't be cancelled, so `runUpload` checks this set once
  // the response lands and deletes the attachment server-side instead of
  // leaving one the user never sees again.
  const removedWhileUploading = new Set<string>();

  const isUploading = computed(() =>
    items.value.some((item) => item.status === 'uploading'),
  );

  const finishedAttachments = computed<TaskAttachment[]>(() =>
    items.value
      .filter(
        (
          item,
        ): item is PendingTaskAttachment & { attachment: TaskAttachment } =>
          item.status === 'done' && !!item.attachment,
      )
      .map((item) => item.attachment),
  );

  function validateFile(file: File): string | null {
    if (!isAcceptedChatAttachment(file.name)) {
      return t('task.attachment.errors.unsupportedType', { name: file.name });
    }
    if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
      return t('task.attachment.errors.tooLarge', { name: file.name });
    }
    return null;
  }

  async function detachFinished(attachmentId: string) {
    try {
      await deleteAttachment({ taskId: toValue(taskId), attachmentId });
    } catch (error) {
      toast.error(
        extractErrorMessage(error, t('task.attachment.removeFailed')),
      );
    }
  }

  async function runUpload(item: PendingTaskAttachment) {
    item.status = 'uploading';
    item.errorMessage = undefined;

    try {
      const { attachments } = await uploadAttachments({
        taskId: toValue(taskId),
        files: [item.file],
      });
      const [attachment] = attachments;
      if (!attachment) {
        throw new Error('Upload response contained no attachment');
      }

      item.attachment = attachment;
      item.status = 'done';
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        item.previewUrl = undefined;
      }

      if (removedWhileUploading.delete(item.id)) {
        await detachFinished(attachment.id);
      }
    } catch (error) {
      removedWhileUploading.delete(item.id);
      item.status = 'error';
      item.errorMessage = extractErrorMessage(
        error,
        t('task.attachment.uploadFailed'),
      );
    }
  }

  function handleFiles(files: File[]) {
    const acceptedFiles: File[] = [];
    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        toast.error(validationError);
        continue;
      }
      acceptedFiles.push(file);
    }
    if (acceptedFiles.length === 0) return;

    for (const file of acceptedFiles) {
      // `reactive`, not a plain object: see the matching comment in
      // useChatAttachments.ts for why a plain object here leaves the
      // "uploading" spinner stuck.
      const item = reactive<PendingTaskAttachment>({
        id: createPrimaryId(),
        file,
        status: 'uploading',
        previewUrl: isImageFilename(file.name)
          ? URL.createObjectURL(file)
          : undefined,
      });
      items.value.push(item);
      // Fire-and-forget: uploads run concurrently, `items` tracks progress.
      runUpload(item);
    }
  }

  async function retry(id: string) {
    const item = items.value.find((candidate) => candidate.id === id);
    if (!item) return;
    await runUpload(item);
  }

  async function remove(id: string) {
    const index = items.value.findIndex((item) => item.id === id);
    if (index === -1) return;

    const [item] = items.value.splice(index, 1);
    if (!item) return;
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);

    if (item.status === 'uploading') {
      removedWhileUploading.add(item.id);
      return;
    }
    if (item.status === 'done' && item.attachment) {
      await detachFinished(item.attachment.id);
    }
  }

  return {
    items,
    isUploading,
    finishedAttachments,
    handleFiles,
    retry,
    remove,
  };
}
