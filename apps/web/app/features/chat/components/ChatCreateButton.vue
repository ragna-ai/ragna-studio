<script setup lang="ts">
import { PlusIcon } from '@lucide/vue';
import { useCreateChatAndNavigate } from '~/features/chat/composables/useChatApi';

// Props
const props = defineProps<{
  agentId: string;
}>();
// Emits

// Refs

// Composables
const { createChatAndNavigate } = useCreateChatAndNavigate();

// Computed
// Functions

// Hooks
</script>

<template>
  <button
    type="button"
    class="flex items-center space-x-2 rounded-full border bg-white px-4 py-2 hover:shadow-sm"
    @click.stop="() => createChatAndNavigate(props.agentId)"
  >
    <div class="flex items-center space-x-1 truncate text-xs">
      <PlusIcon class="size-3 stroke-1" />
      <span>{{ $t('chat.create.label') }}</span>
    </div>
  </button>
</template>
