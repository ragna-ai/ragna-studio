<script setup lang="ts">
// Imports
import { SparklesIcon } from '@lucide/vue';
import VideoGenPreviewDialog from '~/features/video/components/VideoGenPreviewDialog.vue';
import type {
  GeneratedVideo,
  VideoGenAspectRatio,
} from '~/features/video/composables/useVideoGenApi';
import {
  useEnhanceGenVideo,
  useGetGenVideos,
} from '~/features/video/composables/useVideoGenApi';

// Composables
// No pager in this grid yet: request a high limit so it still reads as
// "all of the workspace's videos" under the paginated endpoint, same as
// ImageGenGrid.
const { data, isLoading, isError } = useGetGenVideos({ limit: 100 });
const { mutate: enhanceVideo } = useEnhanceGenVideo();

// Refs
const previewVideo = ref<GeneratedVideo | null>(null);
// Not reactive state on purpose: DOM handles for hover-to-play, keyed by
// video id. Never rendered, only read/written from event handlers.
const videoElements = new Map<string, HTMLVideoElement>();
// The draft currently being enhanced, if any. A plain ref rather than the
// mutation's own isPending/variables: those reflect only the single most
// recent call, this needs to survive re-renders of the specific tile that
// triggered it and block re-submission until it settles.
const enhancingDraftId = ref<string | null>(null);

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

// Veo only produces 16:9 or 9:16; BFL adds six more ratios plus 'auto',
// whose actual rendered shape isn't known ahead of playback
// (specs/videogen/prd-v2.md risk: "auto aspect ratio"). aspect-video is the
// fallback box for that case.
const TILE_ASPECT_CLASS: Record<VideoGenAspectRatio, string> = {
  '21:9': 'aspect-[21/9]',
  '2:1': 'aspect-[2/1]',
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '9:16': 'aspect-[9/16]',
  auto: 'aspect-video',
};

function tileAspectClass(video: GeneratedVideo) {
  return video.aspectRatio ? TILE_ASPECT_CLASS[video.aspectRatio] : 'aspect-video';
}

function isEnhanceableDraft(video: GeneratedVideo) {
  return video.isDraft && video.status === 'completed';
}

// The one-enhance-per-draft rule (specs/videogen/prd-v2.md decision 2): a
// failed enhance can be retried, so only a non-failed enhance row blocks a
// new one. This is a local, best-effort mirror of the server's check for
// the disabled state and its tooltip; the server re-checks authoritatively
// on submit (handleEnhance below), a 409 refreshes the list to correct it.
function hasActiveEnhance(draftId: string) {
  return videos.value.some(
    (video) => video.parentGenVideoId === draftId && video.status !== 'failed',
  );
}

function isEnhanceDisabled(video: GeneratedVideo) {
  return enhancingDraftId.value === video.id || hasActiveEnhance(video.id);
}

function handleEnhance(video: GeneratedVideo) {
  if (isEnhanceDisabled(video)) return;

  enhancingDraftId.value = video.id;
  enhanceVideo(video.id, {
    onSettled: () => {
      enhancingDraftId.value = null;
    },
  });
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
      class="relative overflow-hidden rounded-lg"
    >
      <Badge
        v-if="video.isDraft"
        variant="secondary"
        class="absolute top-2 left-2 z-10"
      >
        {{ $t('videogen.grid.draftBadge') }}
      </Badge>

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

      <div
        v-if="isEnhanceableDraft(video)"
        class="absolute right-2 bottom-2 z-10"
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  :disabled="isEnhanceDisabled(video)"
                  @click.stop="handleEnhance(video)"
                >
                  <Spinner
                    v-if="enhancingDraftId === video.id"
                    class="mr-1.5"
                  />
                  <SparklesIcon v-else class="mr-1.5 size-3.5" />
                  {{ $t('videogen.grid.enhance') }}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent v-if="isEnhanceDisabled(video)">
              {{ $t('videogen.grid.enhanceDisabledReason') }}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  </div>

  <VideoGenPreviewDialog
    :video="previewVideo"
    :has-active-enhance="previewVideo ? hasActiveEnhance(previewVideo.id) : false"
    @close="previewVideo = null"
  />
</template>
