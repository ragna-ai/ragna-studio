<script setup lang="ts">
// Imports
import { PaperclipIcon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import SocialPostMediaThumbnail from '~/features/social/components/SocialPostMediaThumbnail.vue';
import type { SocialPostMedia } from '~/features/social/composables/useSocialPostApi';
import {
  SOCIAL_POST_ALLOWED_MEDIA_MIME_TYPES,
  SOCIAL_POST_MAX_MEDIA,
  SOCIAL_POST_MAX_MEDIA_BYTES,
  useDeleteSocialPostMedia,
  usePendingSocialPostMediaUploads,
  useUpdateSocialPostMediaAltText,
  useUploadSocialPostMedia,
} from '~/features/social/composables/useSocialPostApi';

// Props
const props = defineProps<{
  postId: string;
  media: SocialPostMedia[];
  editable: boolean;
}>();

// Emits
// Refs
const fileInputRef = ref<HTMLInputElement | null>(null);

// Composables
const { t } = useI18n();
const { mutate: uploadMedia } = useUploadSocialPostMedia();
const pendingUploads = usePendingSocialPostMediaUploads(props.postId);
const {
  mutate: deleteMedia,
  isPending: isDeleting,
  variables: deletingVariables,
} = useDeleteSocialPostMedia();
const { mutate: saveAltText } = useUpdateSocialPostMediaAltText();

// Computed
const attachedCount = computed(
  () => props.media.length + pendingUploads.value.length,
);
const canAttachMore = computed(
  () => props.editable && attachedCount.value < SOCIAL_POST_MAX_MEDIA,
);

// Functions
function isRowDeleting(mediaId: string) {
  return isDeleting.value && deletingVariables.value?.mediaId === mediaId;
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function isAllowedMimeType(mimeType: string): boolean {
  return (SOCIAL_POST_ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(
    mimeType,
  );
}

function validateFile(file: File): string | null {
  if (!isAllowedMimeType(file.type)) {
    return t('social.media.errors.unsupportedType');
  }
  if (file.size > SOCIAL_POST_MAX_MEDIA_BYTES) {
    return t('social.media.errors.tooLarge');
  }
  return null;
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';

  // Track the running count locally: the reactive pending-upload count only
  // updates once the mutations below actually start, which happens after
  // this loop finishes.
  let nextCount = attachedCount.value;

  for (const file of files) {
    if (nextCount >= SOCIAL_POST_MAX_MEDIA) {
      toast.error(
        t('social.media.errors.tooMany', { max: SOCIAL_POST_MAX_MEDIA }),
      );
      break;
    }

    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      continue;
    }

    nextCount += 1;
    uploadMedia({ postId: props.postId, file });
  }
}

function handleDelete(mediaId: string) {
  deleteMedia({ postId: props.postId, mediaId });
}

function handleSaveAltText(mediaId: string, altText: string) {
  saveAltText({ postId: props.postId, mediaId, altText });
}

// Hooks
</script>

<template>
  <div
    v-if="editable || media.length > 0"
    class="flex flex-wrap items-center gap-2"
  >
    <SocialPostMediaThumbnail
      v-for="item in media"
      :key="item.id"
      :media="item"
      :editable="editable"
      :is-deleting="isRowDeleting(item.id)"
      @delete="handleDelete"
      @save-alt-text="handleSaveAltText"
    />

    <div
      v-for="(pending, index) in pendingUploads"
      :key="`pending-${index}`"
      class="flex size-20 shrink-0 animate-pulse items-center justify-center rounded-md border bg-muted"
      :title="pending?.file.name"
    >
      <Spinner class="size-5" />
    </div>

    <template v-if="editable">
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/gif"
        class="hidden"
        @change="handleFileChange"
      />
      <Button
        v-if="canAttachMore"
        type="button"
        size="icon"
        variant="outline"
        class="size-20 shrink-0 border-dashed"
        :title="t('social.media.attach')"
        @click="openFilePicker"
      >
        <PaperclipIcon class="size-4" />
      </Button>
    </template>
  </div>
</template>
