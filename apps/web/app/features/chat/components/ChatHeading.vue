<script setup lang="ts">
import { useChatStore } from '~/features/chat/stores/chat.store';
import { cn } from '~/lib/utils';

const chatStore = useChatStore();

const props = defineProps<{
  class?: string;
}>();
</script>

<template>
  <div
    :class="
      cn(
        'flex items-center space-x-2 rounded-full border  px-4 py-1.5',
        props.class,
      )
    "
  >
    <p class="max-w-xs truncate text-xs text-foreground">
      {{ chatStore.title }}
    </p>
  </div>
</template>
