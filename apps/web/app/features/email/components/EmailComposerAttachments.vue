<script setup lang="ts">
import { FolderOpenIcon, PaperclipIcon, XIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import EmailMediaPickerDialog from '~/features/email/components/EmailMediaPickerDialog.vue';
import { EMAIL_MAX_TOTAL_ATTACHMENT_BYTES } from '~/features/email/lib/email-attachment-limits';
import type {
  EmailDraftAttachment,
  MediaListItem,
} from '~/features/email/types';

// Props
// `files`/`media` are sent inline as multipart fields on submit; no eager
// upload step. `draftAttachments` is a third, read-mostly set: a forward
// draft's carried provider attachments - not a model, content is never
// downloaded client-side, only a set the user can shrink via
// `removeDraftAttachment`.
const files = defineModel<File[]>('files', { default: () => [] });
const media = defineModel<MediaListItem[]>('media', { default: () => [] });
const props = defineProps<{ draftAttachments: EmailDraftAttachment[] }>();
const emit = defineEmits<{ removeDraftAttachment: [EmailDraftAttachment] }>();

// Refs
const fileInputRef = ref<HTMLInputElement | null>(null);
const isMediaPickerOpen = ref(false);

// Composables
const { t } = useI18n();

// Computed
const totalBytes = computed(
  () =>
    files.value.reduce((sum, file) => sum + file.size, 0) +
    media.value.reduce((sum, item) => sum + item.size, 0) +
    props.draftAttachments.reduce(
      (sum, attachment) => sum + attachment.size,
      0,
    ),
);
const isOverLimit = computed(
  () => totalBytes.value > EMAIL_MAX_TOTAL_ATTACHMENT_BYTES,
);
const mediaIds = computed(() => media.value.map((item) => item.id));

// Functions
function openFilePicker() {
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  input.value = '';
  files.value = [...files.value, ...selected];
}

function removeFile(index: number) {
  files.value = files.value.filter((_, i) => i !== index);
}

function removeMedia(id: string) {
  media.value = media.value.filter((item) => item.id !== id);
}

function handleMediaAttach(picked: MediaListItem[]) {
  media.value = [...media.value, ...picked];
}

function draftAttachmentKey(attachment: EmailDraftAttachment): string {
  return `${attachment.providerMessageId}-${attachment.providerAttachmentId}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div class="space-y-2">
    <ul
      v-if="files.length > 0 || media.length > 0 || draftAttachments.length > 0"
      class="flex flex-wrap gap-2"
    >
      <li
        v-for="attachment in draftAttachments"
        :key="`draft-${draftAttachmentKey(attachment)}`"
        class="flex items-center gap-1.5 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-xs"
      >
        <PaperclipIcon class="size-3 shrink-0 text-muted-foreground" />
        <span class="max-w-48 truncate">{{ attachment.filename }}</span>
        <span class="text-muted-foreground">{{
          formatBytes(attachment.size)
        }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-5"
          :aria-label="t('email.compose.attachments.remove')"
          @click="emit('removeDraftAttachment', attachment)"
        >
          <XIcon class="size-3" />
        </Button>
      </li>
      <li
        v-for="(file, index) in files"
        :key="`file-${file.name}-${index}`"
        class="flex items-center gap-1.5 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-xs"
      >
        <span class="max-w-48 truncate">{{ file.name }}</span>
        <span class="text-muted-foreground">{{ formatBytes(file.size) }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-5"
          :aria-label="t('email.compose.attachments.remove')"
          @click="removeFile(index)"
        >
          <XIcon class="size-3" />
        </Button>
      </li>
      <li
        v-for="item in media"
        :key="`media-${item.id}`"
        class="flex items-center gap-1.5 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-xs"
      >
        <span class="max-w-48 truncate">{{ item.filename }}</span>
        <span class="text-muted-foreground">{{ formatBytes(item.size) }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-5"
          :aria-label="t('email.compose.attachments.remove')"
          @click="removeMedia(item.id)"
        >
          <XIcon class="size-3" />
        </Button>
      </li>
    </ul>
    <div class="flex items-center gap-2">
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="hidden"
        @change="handleFileChange"
      />
      <Button type="button" variant="outline" size="sm" @click="openFilePicker">
        <PaperclipIcon class="mr-2 size-3.5" />
        {{ t('email.compose.attachments.add') }}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="isMediaPickerOpen = true"
      >
        <FolderOpenIcon class="mr-2 size-3.5" />
        {{ t('email.compose.attachments.fromLibrary') }}
      </Button>
      <p v-if="isOverLimit" class="text-xs text-destructive">
        {{ t('email.compose.attachments.tooLarge') }}
      </p>
    </div>

    <EmailMediaPickerDialog
      v-model:open="isMediaPickerOpen"
      :already-attached-ids="mediaIds"
      @attach="handleMediaAttach"
    />
  </div>
</template>
