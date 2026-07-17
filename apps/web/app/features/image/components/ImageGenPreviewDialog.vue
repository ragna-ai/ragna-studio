<script setup lang="ts">
// Imports
import { CheckIcon, CopyIcon, DownloadIcon } from '@lucide/vue';
import { useClipboard } from '@vueuse/core';
import { toast } from 'vue-sonner';
import type { GeneratedImage } from '~/features/image/composables/useImageGenApi';

interface Props {
  image: GeneratedImage | null;
}

// Props
const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  close: [];
}>();

// Refs
const isDownloading = ref(false);

// Composables
const { copy: copyPrompt, copied: isPromptCopied } = useClipboard();
const { t } = useI18n();

// Functions
function handleOpenChange(open: boolean) {
  if (!open) emit('close');
}

async function downloadImage() {
  const image = props.image;
  if (!image || isDownloading.value) return;

  isDownloading.value = true;
  try {
    const blob = await $fetch<Blob>(image.imgUrl, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${image.id}.png`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error(t('imagen.preview.downloadError'));
  } finally {
    isDownloading.value = false;
  }
}
</script>

<template>
  <Dialog :open="image !== null" @update:open="handleOpenChange">
    <DialogContent class="max-h-[85vh] sm:max-w-3xl lg:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{{ $t('imagen.preview.title') }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4 overflow-hidden lg:flex-row">
        <img
          v-if="image"
          :src="image.imgUrl"
          :alt="image.imgUrl"
          class="max-h-[65vh] w-full rounded-lg object-contain lg:w-2/3"
        />

        <div class="flex flex-col gap-4 lg:w-1/3">
          <div class="relative">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              class="absolute top-2 right-2"
              :aria-label="$t('imagen.preview.copyPrompt')"
              @click="copyPrompt(image?.prompt ?? '')"
            >
              <component
                :is="isPromptCopied ? CheckIcon : CopyIcon"
                class="size-3.5 stroke-1.5"
              />
            </Button>
            <DialogDescription
              class="max-h-[45vh] overflow-y-auto rounded-md border bg-muted p-3 pr-10 text-left whitespace-pre-wrap"
            >
              {{ image?.prompt }}
            </DialogDescription>
          </div>

          <Button
            class="mt-auto"
            :disabled="isDownloading"
            @click="downloadImage"
          >
            <Spinner v-if="isDownloading" class="mr-2" />
            <DownloadIcon v-else class="mr-2 size-4" />
            {{ $t('imagen.preview.download') }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
