<script setup lang="ts">
import { PlusIcon } from '@lucide/vue';
import { useCreateChat } from '~/features/chat/composables/useChatApi';

// Props
const props = defineProps<{
  agentId: string;
}>();
// Emits

// Refs

// Composables
const { mutateAsync: createChat } = useCreateChat();

// Computed
// Functions
const handleCreateChat = async () => {
  if (!props.agentId) return;
  const { chat } = await createChat({ agentId: props.agentId });
  await navigateTo(`/chat/${chat.id}`);
};

// Hooks
</script>

<template>
  <button
    type="button"
    class="flex items-center space-x-2 rounded-full border bg-white px-4 py-2 hover:shadow-sm"
    @click.stop="handleCreateChat"
  >
    <div class="flex items-center space-x-1 truncate text-xs">
      <PlusIcon class="size-3 stroke-1" />
      <span>{{ $t('chat.create.label') }}</span>
    </div>
  </button>
</template>
