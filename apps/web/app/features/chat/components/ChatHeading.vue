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
        'flex items-center space-x-2 rounded-full border bg-white px-4 py-2',
        props.class,
      )
    "
  >
    <div class="flex space-x-1 truncate text-xs">
      <p class="max-w-xs truncate">
        {{ chatStore.title ?? $t('chat.new.title') }}
      </p>
      <p class="">/</p>
      <p class="max-w-40 truncate">
        {{ chatStore.agent?.name ?? 'Default Agent' }}
      </p>
    </div>
  </div>
</template>
