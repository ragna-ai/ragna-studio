<script setup lang="ts">
// Imports
import { PaperclipIcon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Button } from '~/components/ui/button';
import { CHAT_ATTACHMENT_ACCEPT } from '~/features/chat/lib/attachment-mime';
import TaskAttachmentChip from '~/features/task/components/TaskAttachmentChip.vue';
import TaskPendingAttachment from '~/features/task/components/TaskPendingAttachment.vue';
import {
  useDeleteTaskAttachment,
  useGetTaskAttachments,
} from '~/features/task/composables/useTaskApi';
import { useTaskAttachments } from '~/features/task/composables/useTaskAttachments';
import { extractErrorMessage } from '~/lib/api-error';

// Props
interface Props {
  taskId: string;
}

const props = defineProps<Props>();

// Refs
const dropZoneRef = useTemplateRef<HTMLDivElement>('dropZoneRef');

// Composables
const { t } = useI18n();
const taskIdRef = computed(() => props.taskId);
const { data } = useGetTaskAttachments(taskIdRef);
const { items, finishedAttachments, handleFiles, retry, remove } =
  useTaskAttachments(taskIdRef);
const { mutateAsync: deletePersistedAttachment } = useDeleteTaskAttachment();
const { open: openFilePicker, onChange: onFilesPicked } = useFileDialog({
  multiple: true,
  accept: CHAT_ATTACHMENT_ACCEPT,
  reset: true,
});
const { isOverDropZone } = useDropZone(dropZoneRef, {
  multiple: true,
  onDrop: (files) => {
    if (files) handleFiles(files);
  },
});

// Computed
// Excludes attachments this session already uploaded (still shown via
// `items` as pending/done chips) so the same attachment never renders twice
// while `useGetTaskAttachments`'s post-upload invalidation is still
// refetching.
const persistedAttachments = computed(() => {
  const finishedIds = new Set(
    finishedAttachments.value.map((attachment) => attachment.id),
  );
  return (data.value?.attachments ?? []).filter(
    (attachment) => !finishedIds.has(attachment.id),
  );
});
const isEmpty = computed(
  () => persistedAttachments.value.length === 0 && items.value.length === 0,
);

// Functions
async function removePersisted(attachmentId: string) {
  try {
    await deletePersistedAttachment({ taskId: props.taskId, attachmentId });
  } catch (error) {
    toast.error(extractErrorMessage(error, t('task.attachment.removeFailed')));
  }
}

// Hooks
onFilesPicked((fileList) => {
  if (fileList) handleFiles(Array.from(fileList));
});
</script>

<template>
  <div ref="dropZoneRef" class="space-y-2">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold">{{ t('task.attachment.title') }}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="openFilePicker()"
      >
        <PaperclipIcon class="mr-2 size-3.5" />
        {{ t('task.attachment.add') }}
      </Button>
    </div>

    <div
      class="relative rounded-md"
      :class="{ 'ring-2 ring-primary ring-offset-2': isOverDropZone }"
    >
      <p v-if="isEmpty" class="text-sm text-muted-foreground">
        {{ t('task.attachment.empty') }}
      </p>
      <div v-else class="flex flex-wrap gap-2">
        <TaskAttachmentChip
          v-for="attachment in persistedAttachments"
          :key="attachment.id"
          :attachment="attachment"
          @remove="removePersisted"
        />
        <TaskPendingAttachment
          v-for="item in items"
          :key="item.id"
          :item="item"
          @retry="retry"
          @remove="remove"
        />
      </div>
    </div>
  </div>
</template>
