<script setup lang="ts">
import ImageGenForm from '~/features/image/components/ImageGenForm.vue';
import ImageGenGrid from '~/features/image/components/ImageGenGrid.vue';

// Composables
const { t } = useI18n();
useHead({
  title: t('imagen.title'),
});
</script>

<template>
  <div
    class="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 overflow-y-auto p-4"
  >
    <ImageGenForm />
    <ImageGenGrid />
  </div>
</template>
