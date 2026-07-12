<script setup lang="ts">
// Imports
import { DownloadIcon } from '@lucide/vue';
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
    toast.error('Failed to download image');
  } finally {
    isDownloading.value = false;
  }
}
</script>

<template>
  <Dialog :open="image !== null" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Generated image</DialogTitle>
        <DialogDescription class="whitespace-pre-wrap text-left">
          {{ image?.prompt }}
        </DialogDescription>
      </DialogHeader>

      <img
        v-if="image"
        :src="image.imgUrl"
        :alt="image.prompt"
        class="max-h-[70vh] w-full rounded-lg object-contain"
      />

      <DialogFooter>
        <Button :disabled="isDownloading" @click="downloadImage">
          <Spinner v-if="isDownloading" class="mr-2" />
          <DownloadIcon v-else class="mr-2 size-4" />
          Download
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
