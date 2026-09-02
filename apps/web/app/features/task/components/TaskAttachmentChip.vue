<script setup lang="ts">
// Imports
import { XIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { getFileTypeIconName, isImageMediaType } from '~/features/chat/lib/attachment-mime';
import type { TaskAttachment } from '~/features/task/composables/useTaskApi';

// Props
interface Props {
  attachment: TaskAttachment;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  remove: [attachmentId: string];
}>();

// Composables
const { t } = useI18n();
const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl;

// Computed
const isImage = computed(() => isImageMediaType(props.attachment.mediaType));
const fileTypeIcon = computed(() => getFileTypeIconName(props.attachment.filename));
// Document attachments carry a relative, env-independent API download path
// (`/workspace/:id/media/:id/download`); image attachments already carry an
// absolute CDN url. Same resolution as ChatMessage.vue's
// resolveAttachmentHref.
const downloadHref = computed(() =>
  props.attachment.url.startsWith('/')
    ? `${apiBaseUrl}${props.attachment.url}`
    : props.attachment.url,
);

// Functions
function onRemove() {
  emit('remove', props.attachment.id);
}
</script>

<template>
  <div
    class="group relative shrink-0 overflow-hidden rounded-md border bg-muted"
    :class="isImage ? 'size-16' : 'flex h-16 w-44 items-center gap-2 px-2'"
  >
    <a
      :href="downloadHref"
      target="_blank"
      rel="noopener noreferrer"
      class="contents"
    >
      <img
        v-if="isImage"
        :src="attachment.url"
        :alt="attachment.filename"
        class="size-full object-cover"
      />
      <template v-else>
        <Icon :name="fileTypeIcon" class="size-6 shrink-0" />
        <span
          class="truncate text-xs text-muted-foreground"
          :title="attachment.filename"
        >
          {{ attachment.filename }}
        </span>
      </template>
    </a>

    <Button
      type="button"
      size="icon"
      variant="secondary"
      class="absolute top-1 right-1 z-10 size-5 shadow-sm"
      :title="t('task.attachment.remove')"
      @click="onRemove"
    >
      <XIcon class="size-3" />
    </Button>
  </div>
</template>
