<script setup lang="ts">
import { Trash2Icon } from '@lucide/vue';

interface Props {
  prompt: string;
  error: string;
  isDeleting: boolean;
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  delete: [];
}>();
</script>

<template>
  <div
    class="relative flex flex-col justify-between gap-2 rounded-lg bg-muted p-3"
  >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="absolute top-1 right-1 size-7 hover:text-destructive"
      :aria-label="$t('common.delete')"
      :disabled="isDeleting"
      @click="emit('delete')"
    >
      <Spinner v-if="isDeleting" />
      <Trash2Icon v-else class="size-4 stroke-1.5" />
    </Button>
    <p class="line-clamp-4 pr-7 text-sm">{{ prompt }}</p>
    <p class="text-xs text-destructive">{{ error }}</p>
  </div>
</template>
