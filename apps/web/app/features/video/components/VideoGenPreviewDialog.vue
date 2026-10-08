<script setup lang="ts">
// Imports
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  SparklesIcon,
  Trash2Icon,
} from '@lucide/vue';
import { useClipboard } from '@vueuse/core';
import { toast } from 'vue-sonner';
import {
  useDeleteGenVideo,
  useEnhanceGenVideo,
} from '~/features/video/composables/useVideoGenApi';
import type { GeneratedVideo } from '~/features/video/composables/useVideoGenApi';

interface Props {
  video: GeneratedVideo | null;
  // Whether an enhance already exists (non-failed) for this draft, so the
  // Enhance button here can carry the same disabled state as the grid tile
  // it was opened from. The server
  // check is still authoritative on submit.
  hasActiveEnhance?: boolean;
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
const { confirm } = useConfirmDialog();
const { mutateAsync: deleteGenVideo, isPending: isDeleting } = useDeleteGenVideo();
const { mutate: enhanceVideo, isPending: isEnhancing } = useEnhanceGenVideo();

// Computed
const isEnhanceableDraft = computed(
  () => props.video?.isDraft === true && props.video.status === 'completed',
);
const isEnhanceDisabled = computed(
  () => isEnhancing.value || props.hasActiveEnhance === true,
);

// Functions
function handleOpenChange(open: boolean) {
  if (!open) emit('close');
}

function handleEnhance() {
  const video = props.video;
  if (!video || isEnhanceDisabled.value) return;

  // useEnhanceGenVideo already toasts on error and refreshes the list.
  enhanceVideo(video.id);
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

async function deleteVideo() {
  const video = props.video;
  if (!video) return;

  const confirmed = await confirm({
    title: t('videogen.deleteConfirm.title'),
    message: t('videogen.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;

  try {
    await deleteGenVideo(video.id);
    toast.success(t('videogen.preview.deleteSuccess'));
    emit('close');
  } catch {
    // useDeleteGenVideo already toasts the error.
  }
}
</script>

<template>
  <Dialog :open="video !== null" @update:open="handleOpenChange">
    <DialogContent class="max-h-[85vh] sm:max-w-3xl lg:max-w-4xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          {{ $t('videogen.preview.title') }}
          <Badge v-if="video?.isDraft" variant="secondary">
            {{ $t('videogen.grid.draftBadge') }}
          </Badge>
        </DialogTitle>
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
            <template v-if="video.visibleWatermark">
              <dt>{{ $t('videogen.preview.visibleWatermark') }}</dt>
              <dd>{{ $t('videogen.preview.visibleWatermarkApplied') }}</dd>
            </template>
          </dl>

          <div class="mt-auto flex flex-col gap-2">
            <TooltipProvider v-if="isEnhanceableDraft">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span>
                    <Button
                      class="w-full"
                      variant="secondary"
                      :disabled="isEnhanceDisabled"
                      @click="handleEnhance"
                    >
                      <Spinner v-if="isEnhancing" class="mr-2" />
                      <SparklesIcon v-else class="mr-2 size-4" />
                      {{ $t('videogen.grid.enhance') }}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent v-if="isEnhanceDisabled && !isEnhancing">
                  {{ $t('videogen.grid.enhanceDisabledReason') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              :disabled="isDownloading || !video?.videoUrl"
              @click="downloadVideo"
            >
              <Spinner v-if="isDownloading" class="mr-2" />
              <DownloadIcon v-else class="mr-2 size-4" />
              {{ $t('videogen.preview.download') }}
            </Button>
            <Button
              variant="destructive"
              :disabled="isDeleting"
              @click="deleteVideo"
            >
              <Spinner v-if="isDeleting" class="mr-2" />
              <Trash2Icon v-else class="mr-2 size-4" />
              {{ $t('videogen.preview.delete') }}
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
