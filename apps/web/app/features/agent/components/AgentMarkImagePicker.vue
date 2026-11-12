<script setup lang="ts">
import { Button } from '~/components/ui/button';
import AgentMark from '~/features/agent/components/AgentMark.vue';
import {
  AGENT_IMAGE_ACCEPT,
  AGENT_IMAGE_MAX_FILE_BYTES,
  useUploadAgentImage,
} from '~/features/agent/composables/useAgentApi';
import type { UploadedAgentImage } from '~/features/agent/types';
import { toast } from '~/lib/toast';

interface AgentMarkImagePickerProps {
  agentId: string;
  imageUrl: string | null;
  // Known only for a file picked in this session.
  imageName?: string | null;
}

const ACCEPTED_TYPES = AGENT_IMAGE_ACCEPT.split(',');

const props = defineProps<AgentMarkImagePickerProps>();

const emit = defineEmits<{
  uploaded: [image: UploadedAgentImage, file: File];
  remove: [];
}>();

// Refs
const dropZoneRef = useTemplateRef('dropZoneRef');
const inputRef = useTemplateRef('inputRef');

// Composables
const { t, n } = useI18n();
const { isPending: isUploading, mutate: uploadImage } = useUploadAgentImage();
const { isOverDropZone } = useDropZone(dropZoneRef, {
  multiple: false,
  onDrop: (files) => pickFile(files?.[0]),
});

// Computed
const maxSizeLabel = computed(
  () => `${n(AGENT_IMAGE_MAX_FILE_BYTES / 1024 ** 2)} MB`,
);
const fileLabel = computed(
  () => props.imageName ?? t('agent.mark.image.current'),
);

// Functions
function pickFile(file: File | undefined) {
  if (!file) return;
  if (!ACCEPTED_TYPES.includes(file.type)) {
    toast.error(t('agent.mark.errors.wrongType'));
    return;
  }
  if (file.size > AGENT_IMAGE_MAX_FILE_BYTES) {
    toast.error(t('agent.mark.errors.tooLarge', { size: maxSizeLabel.value }));
    return;
  }
  uploadImage(file, {
    onSuccess: (image) => emit('uploaded', image, file),
  });
}

function openPicker() {
  inputRef.value?.click();
}

function handleInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  pickFile(input.files?.[0]);
  input.value = '';
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="isUploading"
      class="flex items-center justify-center gap-2 py-6 text-small text-muted-foreground"
    >
      <Spinner class="size-4" />
      {{ t('agent.mark.image.uploading') }}
    </div>
    <template v-else-if="imageUrl">
      <div class="flex items-center gap-3">
        <AgentMark :agent-id="agentId" :image-url="imageUrl" :size="40" />
        <span class="min-w-0 truncate text-small">{{ fileLabel }}</span>
      </div>
      <div class="flex gap-2">
        <Button type="button" variant="outline" size="sm" @click="openPicker">
          {{ t('agent.mark.image.replace') }}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="text-destructive"
          @click="emit('remove')"
        >
          {{ t('agent.mark.image.remove') }}
        </Button>
      </div>
    </template>
    <div
      v-else
      ref="dropZoneRef"
      role="button"
      tabindex="0"
      class="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-surface-subtle p-4 text-center transition-colors"
      :class="
        isOverDropZone
          ? 'border-primary bg-primary/5'
          : 'border-border-strong hover:border-muted-foreground/50'
      "
      @click="openPicker"
      @keydown.enter="openPicker"
      @keydown.space.prevent="openPicker"
    >
      <Icon name="hugeicons:upload-04" class="size-4 text-icon" />
      <p class="text-small">{{ t('agent.mark.image.dropzone') }}</p>
      <p class="text-caption text-muted-foreground">
        {{ t('agent.mark.image.formats', { size: maxSizeLabel }) }}
      </p>
    </div>
    <input
      ref="inputRef"
      type="file"
      class="hidden"
      :accept="AGENT_IMAGE_ACCEPT"
      @change="handleInputChange"
    />
  </div>
</template>
