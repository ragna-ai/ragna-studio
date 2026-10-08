import { defineStore } from 'pinia';
import type {
  ImageAspectRatio,
  ImageResolution,
} from '~/features/image/composables/useImageGenApi';

/** Image generation settings, persisted in localStorage across sessions. */
export const useImageGenSettingsStore = defineStore('image-gen-settings', () => {
  const modelId = useLocalStorage('image-gen-model-id', '');
  const aspectRatio = useLocalStorage<ImageAspectRatio>(
    'image-gen-aspect-ratio',
    '1:1',
  );
  const resolution = useLocalStorage<ImageResolution>(
    'image-gen-resolution',
    '1K',
  );
  const count = useLocalStorage('image-gen-count', 1);
  // Visible "AI generated" badge burn-in, off by
  // default; provider-independent, so no capability gating in the form.
  const visibleWatermark = useLocalStorage('image-gen-visible-watermark', false);

  return { modelId, aspectRatio, resolution, count, visibleWatermark };
});
