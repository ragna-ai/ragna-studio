<script setup lang="ts">
import {
  useGetAgentMemory,
  useUpdateAgentMemory,
} from '~/features/agent/composables/useAgentApi';

type AgentMemoryPanelProps = {
  agentId: string;
};

// Props
const props = defineProps<AgentMemoryPanelProps>();
// Emits

// Refs
const content = ref('');
const isInitialized = ref(false);

// Composables
const { data, isPending: isLoading } = useGetAgentMemory(() => props.agentId);
const { isPending: isSaving, mutate } = useUpdateAgentMemory();

// Computed
// Functions
const handleSave = () => {
  mutate({ agentId: props.agentId, content: content.value });
};

// Hooks
// Load the document once: later refetches (e.g. after save) must not
// clobber edits the user is currently making.
watch(
  () => data.value?.memory.content,
  (memoryContent) => {
    if (isInitialized.value || memoryContent === undefined) return;
    content.value = memoryContent;
    isInitialized.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Spinner />
    </div>
    <div v-else class="space-y-2">
      <Label class="block text-sm font-medium" for="agent-memory-content">
        Memory
      </Label>
      <Textarea
        id="agent-memory-content"
        v-model="content"
        rows="16"
        class="min-h-100"
        autocomplete="off"
      />
    </div>
    <div class="flex justify-end">
      <Button :disabled="isLoading || isSaving" @click="handleSave">
        <Spinner v-if="isSaving" class="mr-2" />
        Save
      </Button>
    </div>
  </div>
</template>
