<script setup lang="ts">
// Imports
import { storeToRefs } from 'pinia';
import ImageGenPreviewDialog from '~/features/image/components/ImageGenPreviewDialog.vue';
import type { GeneratedImage } from '~/features/image/composables/useImageGenApi';
import {
  useGetGenImages,
  usePendingGenImageCount,
} from '~/features/image/composables/useImageGenApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Refs
const previewImage = ref<GeneratedImage | null>(null);

// Composables
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
// No pager in this grid yet: request a high limit so it still reads as
// "all of the workspace's images" under the paginated endpoint.
const { data, isLoading, isError } = useGetGenImages(activeWorkspaceId, {
  limit: 100,
});
const pendingCount = usePendingGenImageCount();

// Computed
const images = computed(() => data.value?.genImages ?? []);

const isEmpty = computed(
  () => images.value.length === 0 && pendingCount.value === 0,
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
      v-for="image in images"
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

  <ImageGenPreviewDialog :image="previewImage" @close="previewImage = null" />
</template>
