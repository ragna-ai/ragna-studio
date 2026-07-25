<script setup lang="ts">
// Imports
import ImageGenPreviewDialog from '~/features/image/components/ImageGenPreviewDialog.vue';
import type {
  GeneratedImage,
  ReuseImageSettings,
} from '~/features/image/composables/useImageGenApi';
import { usePendingGenImageCount } from '~/features/image/composables/useImageGenApi';

interface Props {
  // Fetched once by the /text-to-image page and shared with the form's
  // reference picker, rather than this grid running its own query for the
  // same list (docs/imagegen/prd.md).
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

// Composables
const pendingCount = usePendingGenImageCount();

// Computed
const isEmpty = computed(
  () => props.genImages.length === 0 && pendingCount.value === 0,
);
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
      v-for="placeholder in pendingCount"
      :key="`pending-${placeholder}`"
      class="mb-4 aspect-square w-full animate-pulse rounded-lg bg-muted"
    />
    <button
      v-for="image in genImages"
      :key="image.id"
      type="button"
      class="group mb-4 block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring"
      @click="previewImage = image"
    >
      <img
        :src="image.imgUrl"
        :alt="image.imgUrl"
        loading="lazy"
        class="w-full rounded-lg group-hover:shadow-md group-hover:shadow-black/30"
      />
    </button>
  </div>

  <ImageGenPreviewDialog
    :image="previewImage"
    @close="previewImage = null"
    @reuse="(settings) => emit('reuse', settings)"
  />
</template>
