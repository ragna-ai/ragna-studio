<script setup lang="ts">
// Imports
import { RotateCcwIcon, XIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import type { PendingAttachment } from '~/features/chat/composables/useChatAttachments';
import { getFileTypeIconName, isImageFilename } from '~/features/chat/lib/attachment-mime';

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
    class="group relative shrink-0 overflow-hidden rounded-md border bg-muted"
    :class="isImage ? 'size-16' : 'flex h-16 w-44 items-center gap-2 px-2'"
  >
    <img
      v-if="isImage && thumbnailUrl"
      :src="thumbnailUrl"
      :alt="item.file.name"
      class="size-full object-cover"
    />
    <template v-else-if="!isImage">
      <Icon :name="fileTypeIcon" class="size-6 shrink-0" />
      <span
        class="truncate text-xs text-muted-foreground"
        :title="item.file.name"
      >
        {{ item.file.name }}
      </span>
    </template>

    <!-- Uploading -->
    <div
      v-if="item.status === 'uploading'"
      class="absolute inset-0 flex items-center justify-center bg-background/70"
    >
      <Spinner class="size-5" />
    </div>

    <!-- Failed: message plus retry, remove stays reachable via the corner button -->
    <div
      v-else-if="item.status === 'error'"
      class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/90 p-1"
    >
      <p class="line-clamp-2 text-center text-[10px] text-destructive">
        {{ item.errorMessage }}
      </p>
      <Button
        type="button"
        size="icon"
        variant="outline"
        class="size-6"
        :title="t('chat.attachment.retry')"
        @click="onRetry"
      >
        <RotateCcwIcon class="size-3" />
      </Button>
    </div>

    <Button
      type="button"
      size="icon"
      variant="secondary"
      class="absolute top-1 right-1 z-10 size-5 shadow-sm"
      :title="t('chat.attachment.remove')"
      @click="onRemove"
    >
      <XIcon class="size-3" />
    </Button>
  </div>
</template>
