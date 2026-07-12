<script setup lang="ts">
// Imports
import { Spinner } from '@/components/ui/spinner';
import ImageGenPreviewDialog from '~/features/image/components/ImageGenPreviewDialog.vue';
import type { GeneratedImage } from '~/features/image/composables/useImageGenApi';
import {
  useGetGenImages,
  usePendingGenImageCount,
} from '~/features/image/composables/useImageGenApi';

// Refs
const previewImage = ref<GeneratedImage | null>(null);

// Composables
const { data, isLoading, isError } = useGetGenImages();
const pendingCount = usePendingGenImageCount();

// Computed
const images = computed(() => data.value?.images ?? []);

const isEmpty = computed(
  () => images.value.length === 0 && pendingCount.value === 0,
);
</script>

<template>
  <div v-if="isLoading" class="flex justify-center py-12">
    <Spinner />
  </div>
  <p v-else-if="isError" class="py-12 text-center text-sm text-destructive">
    Failed to load generated images.
  </p>
  <p v-else-if="isEmpty" class="py-12 text-center text-sm text-muted-foreground">
    No images yet. Describe an image above to generate one.
  </p>
  <div v-else class="columns-2 gap-4 lg:columns-3">
    <div
      v-for="placeholder in pendingCount"
      :key="`pending-${placeholder}`"
      class="mb-4 aspect-square w-full animate-pulse rounded-lg bg-muted"
    />
    <button
      v-for="image in images"
      :key="image.id"
      type="button"
      class="group mb-4 block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring"
      :title="image.prompt"
      @click="previewImage = image"
    >
      <img
        :src="image.imgUrl"
        :alt="image.prompt"
        loading="lazy"
        class="w-full rounded-lg transition-opacity group-hover:opacity-90"
      />
    </button>
  </div>

  <ImageGenPreviewDialog :image="previewImage" @close="previewImage = null" />
</template>
