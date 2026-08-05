import { defineStore } from 'pinia';
import type {
  VideoGenAspectRatio,
  VideoGenResolution,
} from '~/features/video/composables/useVideoGenApi';

/** Video generation settings, persisted in localStorage across sessions. */
export const useVideoGenSettingsStore = defineStore(
  'video-gen-settings',
  () => {
    const modelId = useLocalStorage('video-gen-model-id', '');
    const aspectRatio = useLocalStorage<VideoGenAspectRatio>(
      'video-gen-aspect-ratio',
      '16:9',
    );
    const resolution = useLocalStorage<VideoGenResolution>(
      'video-gen-resolution',
      '720p',
    );
    // A plain number now: Veo keeps its fixed 4/6/8s picker, BFL drives a
    // 5-20s slider off videoGenCapabilities (docs/videogen/prd-v2.md).
    const duration = useLocalStorage('video-gen-duration', 4);
    const generateAudio = useLocalStorage('video-gen-generate-audio', true);
    // BFL-only draft toggle (docs/videogen/prd-v2.md); reconciled back to
    // false in VideoGenForm.vue when the selected model's provider doesn't
    // support it.
    const draft = useLocalStorage('video-gen-draft', false);

    return { modelId, aspectRatio, resolution, duration, generateAudio, draft };
  },
);
