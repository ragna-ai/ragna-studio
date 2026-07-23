import { defineStore } from 'pinia';
import type {
  VideoGenAspectRatio,
  VideoGenDuration,
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
    const duration = useLocalStorage<VideoGenDuration>('video-gen-duration', 4);
    const generateAudio = useLocalStorage('video-gen-generate-audio', true);

    return { modelId, aspectRatio, resolution, duration, generateAudio };
  },
);
