import { toast } from 'vue-sonner';
import {
  type ChatAttachment,
  useDeleteChatAttachment,
  useUploadChatAttachments,
} from '~/features/chat/composables/useChatApi';
import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  isAcceptedChatAttachment,
  isImageFilename,
} from '~/features/chat/lib/attachment-mime';
import { extractErrorMessage } from '~/lib/api-error';
import { createPrimaryId } from '~/lib/utils';

export type PendingAttachmentStatus = 'uploading' | 'done' | 'error';

export interface PendingAttachment {
  id: string;
  file: File;
  status: PendingAttachmentStatus;
  /** Local preview while uploading; swapped for `attachment.url` on success. */
  previewUrl?: string;
  attachment?: ChatAttachment;
  errorMessage?: string;
}

/**
 * Owns the "attach files to the next message" flow for the chat input:
 * client-side validation, eager upload, and the pending strip's local state.
 *
 * `ensureChat` is injected rather than called here because chat creation is
 * lazy and its state (`chatId`, the create-chat mutation) lives in the
 * parent component that also owns `sendMessage`.
 */
export function useChatAttachments(ensureChat: () => Promise<string>) {
  const { t } = useI18n();
  const { mutateAsync: uploadAttachments } = useUploadChatAttachments();
  const { mutateAsync: deleteAttachment } = useDeleteChatAttachment();

  const items = ref<PendingAttachment[]>([]);

  // Ids removed by the user while their upload was still in flight. The
  // in-flight fetch can't be cancelled, so `runUpload` checks this set once
  // the response lands and detaches the attachment server-side instead of
  // leaving an orphaned chat_attachment row the user never sees again.
  const removedWhileUploading = new Set<string>();

  const isUploading = computed(() =>
    items.value.some((item) => item.status === 'uploading'),
  );

  const finishedAttachments = computed<ChatAttachment[]>(() =>
    items.value
      .filter(
        (item): item is PendingAttachment & { attachment: ChatAttachment } =>
          item.status === 'done' && !!item.attachment,
      )
      .map((item) => item.attachment),
  );

  function validateFile(file: File): string | null {
    if (!isAcceptedChatAttachment(file.name)) {
      return t('chat.input.errors.unsupportedType', { name: file.name });
    }
    if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
      return t('chat.input.errors.tooLarge', { name: file.name });
    }
    return null;
  }

  async function detachFinished(attachmentId: string) {
    try {
      const chatId = await ensureChat();
      await deleteAttachment({ chatId, attachmentId });
    } catch (error) {
      toast.error(
        extractErrorMessage(error, t('chat.attachment.removeFailed')),
      );
    }
  }

  async function runUpload(chatId: string, item: PendingAttachment) {
    item.status = 'uploading';
    item.errorMessage = undefined;

    try {
      const { attachments } = await uploadAttachments({
        chatId,
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
        t('chat.attachment.uploadFailed'),
      );
    }
  }

  async function handleFiles(files: File[]) {
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

    let chatId: string;
    try {
      chatId = await ensureChat();
    } catch {
      toast.error(t('chat.attachment.chatUnavailable'));
      return;
    }

    for (const file of acceptedFiles) {
      // `reactive`, not a plain object: `items` is a reactive array, whose
      // `set` trap unwraps any value pushed into it back to its raw target
      // (`toRaw`). A plain object pushed here would end up mutated below
      // through this same raw, un-proxied `item` reference, which writes
      // the new field values but never fires the trap that notifies
      // watchers/computeds/templates. The UI would silently go stale
      // (status stuck on 'uploading' forever). Wrapping it in `reactive`
      // up front makes `item` itself the tracked proxy, so `runUpload`'s
      // mutations go through the same object the array and template see.
      const item = reactive<PendingAttachment>({
        id: createPrimaryId(),
        file,
        status: 'uploading',
        previewUrl: isImageFilename(file.name)
          ? URL.createObjectURL(file)
          : undefined,
      });
      items.value.push(item);
      // Fire-and-forget: uploads run concurrently, `items` tracks progress.
      runUpload(chatId, item);
    }
  }

  async function retry(id: string) {
    const item = items.value.find((candidate) => candidate.id === id);
    if (!item) return;
    const chatId = await ensureChat();
    await runUpload(chatId, item);
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

  function clear() {
    for (const item of items.value) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    items.value = [];
  }

  return {
    items,
    isUploading,
    finishedAttachments,
    handleFiles,
    retry,
    remove,
    clear,
  };
}
