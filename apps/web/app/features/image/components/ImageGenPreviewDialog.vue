<script setup lang="ts">
// Imports
import { CheckIcon, CopyIcon, DownloadIcon, Trash2Icon } from '@lucide/vue';
import { useClipboard } from '@vueuse/core';
import { toast } from 'vue-sonner';
import { useDeleteGenImage } from '~/features/image/composables/useImageGenApi';
import type {
  GeneratedImage,
  ReuseImageSettings,
} from '~/features/image/composables/useImageGenApi';

interface Props {
  image: GeneratedImage | null;
}

// Props
const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  close: [];
  reuse: [settings: ReuseImageSettings];
}>();

// Refs
const isDownloading = ref(false);

// Composables
const { copy: copyPrompt, copied: isPromptCopied } = useClipboard();
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { mutateAsync: deleteGenImage, isPending: isDeleting } = useDeleteGenImage();

// Functions
function handleOpenChange(open: boolean) {
  if (!open) emit('close');
}

async function downloadImage() {
  const image = props.image;
  // imgUrl is undefined for a pending/processing/failed row
  // (docs/imagegen/worker-execution-prd.md decision 7); the grid only ever
  // opens this dialog for a completed image, but the prop type allows any
  // status, so this guards the download call itself too.
  if (!image || !image.imgUrl || isDownloading.value) return;

  isDownloading.value = true;
  try {
    const blob = await $fetch<Blob>(image.imgUrl, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${image.id}.png`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error(t('imagen.preview.downloadError'));
  } finally {
    isDownloading.value = false;
  }
}

function reuseSettings() {
  const image = props.image;
  if (!image) return;

  // Reference images don't round-trip from this response: 'upload' entries
  // only carry a display URL (no storage key to resubmit), and 'genImage'
  // entries would need a lookup back to their source row. Everything else
  // reuses cleanly, so only that subset is emitted.
  emit('reuse', {
    provider: image.provider,
    model: image.model,
    aspectRatio: image.aspectRatio,
    resolution: image.resolution,
    seed: image.seed,
    negativePrompt: image.negativePrompt,
    visibleWatermark: image.visibleWatermark,
  });
  emit('close');
}

async function deleteImage() {
  const image = props.image;
  if (!image) return;

  const confirmed = await confirm({
    title: t('imagen.deleteConfirm.title'),
    message: t('imagen.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;

  try {
    await deleteGenImage(image.id);
    toast.success(t('imagen.preview.deleteSuccess'));
    emit('close');
  } catch {
    // useDeleteGenImage already toasts the error.
  }
}
</script>

<template>
  <Dialog :open="image !== null" @update:open="handleOpenChange">
    <DialogContent class="max-h-[85vh] sm:max-w-3xl lg:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{{ $t('imagen.preview.title') }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4 overflow-hidden lg:flex-row">
        <img
          v-if="image"
          :src="image.imgUrl"
          :alt="image.imgUrl"
          class="max-h-[65vh] w-full rounded-lg object-contain lg:w-2/3"
        />

        <div class="flex flex-col gap-4 lg:w-1/3">
          <div class="relative">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              class="absolute top-2 right-2"
              :aria-label="$t('imagen.preview.copyPrompt')"
              @click="copyPrompt(image?.prompt ?? '')"
            >
              <component
                :is="isPromptCopied ? CheckIcon : CopyIcon"
                class="size-3.5 stroke-1.5"
              />
            </Button>
            <DialogDescription
              class="max-h-[45vh] overflow-y-auto rounded-md border bg-muted p-3 pr-10 text-left whitespace-pre-wrap"
            >
              {{ image?.prompt }}
            </DialogDescription>
          </div>

          <dl
            v-if="image"
            class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted-foreground"
          >
            <template v-if="image.model">
              <dt>{{ $t('imagen.preview.model') }}</dt>
              <dd class="truncate">{{ image.model }}</dd>
            </template>
            <template v-if="image.aspectRatio">
              <dt>{{ $t('imagen.preview.aspectRatio') }}</dt>
              <dd>{{ image.aspectRatio }}</dd>
            </template>
            <template v-if="image.resolution">
              <dt>{{ $t('imagen.preview.resolution') }}</dt>
              <dd>{{ image.resolution }}</dd>
            </template>
            <template v-if="image.seed != null">
              <dt>{{ $t('imagen.preview.seed') }}</dt>
              <dd>{{ image.seed }}</dd>
            </template>
            <template v-if="image.negativePrompt">
              <dt>{{ $t('imagen.preview.negativePrompt') }}</dt>
              <dd class="truncate">{{ image.negativePrompt }}</dd>
            </template>
            <template v-if="image.visibleWatermark">
              <dt>{{ $t('imagen.preview.visibleWatermark') }}</dt>
              <dd>{{ $t('imagen.preview.visibleWatermarkApplied') }}</dd>
            </template>
          </dl>

          <div
            v-if="image && image.referenceImages.length > 0"
            class="space-y-1"
          >
            <p class="text-sm text-muted-foreground">
              {{ $t('imagen.preview.referenceImages') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <img
                v-for="(reference, index) in image.referenceImages"
                :key="`${reference.origin}-${index}`"
                :src="reference.imgUrl"
                alt=""
                class="size-12 rounded-md border object-cover"
              />
            </div>
          </div>

          <div class="mt-auto flex flex-col gap-2">
            <Button variant="outline" @click="reuseSettings">
              {{ $t('imagen.preview.reuseSettings') }}
            </Button>
            <Button :disabled="isDownloading" @click="downloadImage">
              <Spinner v-if="isDownloading" class="mr-2" />
              <DownloadIcon v-else class="mr-2 size-4" />
              {{ $t('imagen.preview.download') }}
            </Button>
            <Button
              variant="destructive"
              :disabled="isDeleting"
              @click="deleteImage"
            >
              <Spinner v-if="isDeleting" class="mr-2" />
              <Trash2Icon v-else class="mr-2 size-4" />
              {{ $t('imagen.preview.delete') }}
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
