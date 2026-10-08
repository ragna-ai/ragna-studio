<script setup lang="ts">
import ImageGenForm from '~/features/image/components/ImageGenForm.vue';
import ImageGenGrid from '~/features/image/components/ImageGenGrid.vue';
import { useGetGenImages } from '~/features/image/composables/useImageGenApi';

// Composables
const { t } = useI18n();
useHead({
  title: t('imagen.title'),
});

// Fetched once here and passed down to both the grid and the form's
// reference-image picker, so they read the same list instead of each
// running its own query.
// No pager yet: request a high limit so it still reads as "all of the
// workspace's images" under the paginated endpoint.
const { data: genImageData, isError: isGenImagesError } = useGetGenImages({
  limit: 100,
});
const genImages = computed(() => genImageData.value?.genImages ?? []);

// Refs
// The grid's preview dialog can't reach the form directly (separate
// branches of the tree), so its "reuse settings" event is relayed here and
// applied through this exposed method.
const imageGenFormRef = useTemplateRef('imageGenFormRef');
</script>

<template>
  <div
    class="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 overflow-y-auto p-4"
  >
    <ImageGenForm ref="imageGenFormRef" :gen-images="genImages" />
    <ImageGenGrid
      :gen-images="genImages"
      :is-error="isGenImagesError"
      @reuse="(settings) => imageGenFormRef?.applyReusedSettings(settings)"
    />
  </div>
</template>
