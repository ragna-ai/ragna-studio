<script setup lang="ts">
// Imports
import { toast } from 'vue-sonner';
import ImageGenPreviewDialog from '~/features/image/components/ImageGenPreviewDialog.vue';
import { useDeleteGenImage } from '~/features/image/composables/useImageGenApi';
import type {
  GeneratedImage,
  ImageAspectRatio,
  ReuseImageSettings,
} from '~/features/image/composables/useImageGenApi';

interface Props {
  // Fetched once by the /text-to-image page and shared with the form's
  // reference picker, rather than this grid running its own query for the
  // same list. Already includes pending/processing/
  // failed rows: the form's mutation prepends them into the cached list on
  // submit, and useGetGenImages polls while any are unfinished.
  genImages: GeneratedImage[];
  isError: boolean;
}

// Props
const props = defineProps<Props>();

// Emits
// Relayed up to the /text-to-image page, which owns the form ref that
// applies these settings; the grid and the dialog have no direct access
// to the form.
const emit = defineEmits<{
  reuse: [settings: ReuseImageSettings];
}>();

// Refs
const previewImage = ref<GeneratedImage | null>(null);
const deletingImageId = ref<string | null>(null);

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { mutateAsync: deleteGenImage } = useDeleteGenImage();

// Computed
const isEmpty = computed(() => props.genImages.length === 0);

// Functions
// A pending/processing/failed tile has no image to preview yet.
function openPreview(image: GeneratedImage) {
  if (image.status === 'completed') {
    previewImage.value = image;
  }
}

async function deleteFailedImage(image: GeneratedImage) {
  const confirmed = await confirm({
    title: t('imagen.deleteConfirm.title'),
    message: t('imagen.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;

  deletingImageId.value = image.id;
  try {
    await deleteGenImage(image.id);
    toast.success(t('imagen.preview.deleteSuccess'));
  } catch {
    // useDeleteGenImage already toasts the error.
  } finally {
    deletingImageId.value = null;
  }
}

// Placeholder tiles (pending/processing/failed) don't have a real image to
// size themselves off of yet, so they fall back to the settings the request
// was made with, the same way VideoGenGrid.vue's TILE_ASPECT_CLASS does.
const TILE_ASPECT_CLASS: Record<ImageAspectRatio, string> = {
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
  '16:9': 'aspect-video',
};

function tileAspectClass(image: GeneratedImage) {
  return image.aspectRatio
    ? TILE_ASPECT_CLASS[image.aspectRatio]
    : 'aspect-square';
}
</script>

<template>
  <p v-if="isError" class="py-12 text-center text-sm text-destructive">
    {{ $t('imagen.grid.loadError') }}
  </p>
  <p
    v-else-if="isEmpty"
    class="py-12 text-center text-sm text-muted-foreground"
  >
    {{ $t('imagen.grid.empty') }}
  </p>
  <div v-else class="columns-2 gap-4 lg:columns-3">
    <div
      v-for="image in genImages"
      :key="image.id"
      class="mb-4 break-inside-avoid"
    >
      <button
        v-if="image.status === 'completed' && image.imgUrl"
        type="button"
        class="group block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring"
        @click="openPreview(image)"
      >
        <img
          :src="image.imgUrl"
          :alt="image.imgUrl"
          loading="lazy"
          class="w-full rounded-lg group-hover:shadow-md group-hover:shadow-black/30"
        />
      </button>

      <GenerationFailedTile
        v-else-if="image.status === 'failed'"
        :prompt="image.prompt"
        :error="image.error ?? $t('imagen.grid.failed')"
        :is-deleting="deletingImageId === image.id"
        :class="tileAspectClass(image)"
        @delete="deleteFailedImage(image)"
      />

      <GenerationPendingTile
        v-else
        :prompt="image.prompt"
        :class="tileAspectClass(image)"
      />
    </div>
  </div>

  <ImageGenPreviewDialog
    :image="previewImage"
    @close="previewImage = null"
    @reuse="(settings) => emit('reuse', settings)"
  />
</template>
