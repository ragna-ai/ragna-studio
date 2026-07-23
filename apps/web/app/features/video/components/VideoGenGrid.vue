<script setup lang="ts">
// Imports
import VideoGenPreviewDialog from '~/features/video/components/VideoGenPreviewDialog.vue';
import type { GeneratedVideo } from '~/features/video/composables/useVideoGenApi';
import { useGetGenVideos } from '~/features/video/composables/useVideoGenApi';

// Refs
const previewVideo = ref<GeneratedVideo | null>(null);
// Not reactive state on purpose: DOM handles for hover-to-play, keyed by
// video id. Never rendered, only read/written from event handlers.
const videoElements = new Map<string, HTMLVideoElement>();

// Composables
// No pager in this grid yet: request a high limit so it still reads as
// "all of the workspace's videos" under the paginated endpoint, same as
// ImageGenGrid.
const { data, isLoading, isError } = useGetGenVideos({ limit: 100 });

// Computed
const videos = computed(() => data.value?.genVideos ?? []);
const isEmpty = computed(() => !isLoading.value && videos.value.length === 0);

// Functions
function setVideoElement(id: string, el: unknown) {
  if (el instanceof HTMLVideoElement) {
    videoElements.set(id, el);
  } else {
    videoElements.delete(id);
  }
}

function playPreview(id: string) {
  void videoElements.get(id)?.play().catch(() => {});
}

function stopPreview(id: string) {
  const video = videoElements.get(id);
  if (!video) return;
  video.pause();
  video.currentTime = 0;
}

// Veo only produces 16:9 or 9:16 clips (docs/videogen/prd.md), so the tile
// shape is known upfront instead of measuring the media.
function tileAspectClass(video: GeneratedVideo) {
  return video.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video';
}
</script>

<template>
  <p v-if="isError" class="py-12 text-center text-sm text-destructive">
    {{ $t('videogen.grid.loadError') }}
  </p>
  <p
    v-else-if="isEmpty"
    class="py-12 text-center text-sm text-muted-foreground"
  >
    {{ $t('videogen.grid.empty') }}
  </p>
  <div v-else class="grid grid-cols-2 gap-4 lg:grid-cols-3">
    <div
      v-for="video in videos"
      :key="video.id"
      class="overflow-hidden rounded-lg"
    >
      <button
        v-if="video.status === 'completed' && video.videoUrl"
        type="button"
        class="group block w-full cursor-zoom-in overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
        :class="tileAspectClass(video)"
        @mouseenter="playPreview(video.id)"
        @mouseleave="stopPreview(video.id)"
        @click="previewVideo = video"
      >
        <video
          :ref="(el) => setVideoElement(video.id, el)"
          :src="video.videoUrl"
          preload="metadata"
          muted
          loop
          playsinline
          class="size-full object-cover group-hover:shadow-md group-hover:shadow-black/30"
        />
      </button>

      <div
        v-else-if="video.status === 'failed'"
        class="flex flex-col justify-between gap-2 rounded-lg bg-muted p-3"
        :class="tileAspectClass(video)"
      >
        <p class="line-clamp-4 text-sm">{{ video.prompt }}</p>
        <p class="text-xs text-destructive">
          {{ video.error ?? $t('videogen.grid.failed') }}
        </p>
      </div>

      <div
        v-else
        class="flex flex-col justify-between gap-2 rounded-lg bg-muted p-3"
        :class="tileAspectClass(video)"
      >
        <p class="line-clamp-4 text-sm text-muted-foreground">
          {{ video.prompt }}
        </p>
        <Spinner class="size-4" />
      </div>
    </div>
  </div>

  <VideoGenPreviewDialog :video="previewVideo" @close="previewVideo = null" />
</template>
