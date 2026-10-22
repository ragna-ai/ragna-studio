<script setup lang="ts">
import VideoGenForm from '~/features/video/components/VideoGenForm.vue';
import VideoGenGrid from '~/features/video/components/VideoGenGrid.vue';

// Composables
const { t } = useI18n();
useHead({
  title: t('videogen.title'),
});
</script>

<template>
  <div class="h-full w-full overflow-y-auto">
    <div class="mx-auto flex w-full max-w-4xl flex-col gap-8 p-4">
      <VideoGenForm />
      <VideoGenGrid />
    </div>
  </div>
</template>
