<script setup lang="ts">
// Imports
import { CheckIcon, CopyIcon, DownloadIcon } from '@lucide/vue';
import { useClipboard } from '@vueuse/core';
import { toast } from 'vue-sonner';
import type { GeneratedVideo } from '~/features/video/composables/useVideoGenApi';

interface Props {
  video: GeneratedVideo | null;
}

// Props
const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  close: [];
}>();

// Refs
const isDownloading = ref(false);

// Composables
const { copy: copyPrompt, copied: isPromptCopied } = useClipboard();
const { t } = useI18n();

// Functions
function handleOpenChange(open: boolean) {
  if (!open) emit('close');
}

async function downloadVideo() {
  const video = props.video;
  if (!video?.videoUrl || isDownloading.value) return;

  isDownloading.value = true;
  try {
    const blob = await $fetch<Blob>(video.videoUrl, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${video.id}.mp4`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error(t('videogen.preview.downloadError'));
  } finally {
    isDownloading.value = false;
  }
}
</script>

<template>
  <Dialog :open="video !== null" @update:open="handleOpenChange">
    <DialogContent class="max-h-[85vh] sm:max-w-3xl lg:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{{ $t('videogen.preview.title') }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4 overflow-hidden lg:flex-row">
        <video
          v-if="video?.videoUrl"
          :src="video.videoUrl"
          controls
          autoplay
          loop
          class="max-h-[65vh] w-full rounded-lg object-contain lg:w-2/3"
        />

        <div class="flex flex-col gap-4 lg:w-1/3">
          <div class="relative">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              class="absolute top-2 right-2"
              :aria-label="$t('videogen.preview.copyPrompt')"
              @click="copyPrompt(video?.prompt ?? '')"
            >
              <component
                :is="isPromptCopied ? CheckIcon : CopyIcon"
                class="size-3.5 stroke-1.5"
              />
            </Button>
            <DialogDescription
              class="max-h-[30vh] overflow-y-auto rounded-md border bg-muted p-3 pr-10 text-left whitespace-pre-wrap"
            >
              {{ video?.prompt }}
            </DialogDescription>
          </div>

          <dl
            v-if="video"
            class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted-foreground"
          >
            <dt>{{ $t('videogen.preview.aspectRatio') }}</dt>
            <dd>{{ video.aspectRatio }}</dd>
            <dt>{{ $t('videogen.preview.resolution') }}</dt>
            <dd>{{ video.resolution }}</dd>
            <dt>{{ $t('videogen.preview.duration') }}</dt>
            <dd v-if="video.duration != null">
              {{ t('videogen.form.durationSeconds', { seconds: video.duration }) }}
            </dd>
            <dd v-else>—</dd>
            <dt>{{ $t('videogen.preview.model') }}</dt>
            <dd class="truncate">{{ video.model }}</dd>
          </dl>

          <Button
            class="mt-auto"
            :disabled="isDownloading || !video?.videoUrl"
            @click="downloadVideo"
          >
            <Spinner v-if="isDownloading" class="mr-2" />
            <DownloadIcon v-else class="mr-2 size-4" />
            {{ $t('videogen.preview.download') }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
