<script setup lang="ts">
// Imports
import { Spinner } from '~/components/ui/spinner';
import type { PendingAttachment } from '~/features/chat/composables/useChatAttachments';
import {
  getFileTypeIconName,
  isImageFilename,
} from '~/features/chat/lib/attachment-mime';

// Props
interface Props {
  item: PendingAttachment;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  retry: [id: string];
  remove: [id: string];
}>();

// Composables
const { t } = useI18n();

// Computed
const isImage = computed(() => isImageFilename(props.item.file.name));
const fileTypeIcon = computed(() => getFileTypeIconName(props.item.file.name));
const thumbnailUrl = computed(
  () => props.item.attachment?.url ?? props.item.previewUrl,
);

// Functions
function onRetry() {
  emit('retry', props.item.id);
}

function onRemove() {
  emit('remove', props.item.id);
}
</script>

<template>
  <div
    class="flex h-8 max-w-60 shrink-0 items-center gap-2 rounded-md border bg-background pr-1 pl-2 text-small"
    :class="item.status === 'error' && 'border-destructive'"
  >
    <img
      v-if="isImage && thumbnailUrl"
      :src="thumbnailUrl"
      :alt="item.file.name"
      class="size-5 shrink-0 rounded-xs object-cover"
    />
    <Icon v-else :name="fileTypeIcon" class="size-4 shrink-0" />
    <span
      class="min-w-0 truncate"
      :class="item.status === 'error' ? 'text-destructive' : 'text-foreground'"
      :title="item.status === 'error' ? item.errorMessage : item.file.name"
    >
      {{ item.status === 'error' ? item.errorMessage : item.file.name }}
    </span>

    <Spinner v-if="item.status === 'uploading'" class="size-4 shrink-0" />
    <button
      v-else-if="item.status === 'error'"
      type="button"
      class="flex size-6 shrink-0 items-center justify-center rounded-sm text-icon transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      :title="t('chat.attachment.retry')"
      :aria-label="t('chat.attachment.retry')"
      @click="onRetry"
    >
      <Icon name="hugeicons:refresh" class="size-3.5" />
    </button>

    <button
      type="button"
      class="flex size-6 shrink-0 items-center justify-center rounded-sm text-icon transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      :title="t('chat.attachment.remove')"
      :aria-label="t('chat.attachment.remove')"
      @click="onRemove"
    >
      <Icon name="hugeicons:cancel-01" class="size-3.5" />
    </button>
  </div>
</template>
